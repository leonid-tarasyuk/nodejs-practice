import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Transform, pipeline } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { createGzip } from 'node:zlib';
import { DriveError } from '../../utils/errors.js';
import { ProgressPrinter } from '../../utils/logger.js';
import { createFileReadStream } from '../filesystem/file-reader.js';
import { DriveClient } from './drive.client.js';

const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
// Resumable upload chunks must be a multiple of 256 KB.
const CHUNK_SIZE = 32 * 256 * 1024; // 8 MB
const MAX_RETRIES = 6;

/**
 * Uploads a local file to Google Drive using the resumable upload protocol:
 * the file is streamed in 8 MB chunks, so even a multi-gigabyte file is never
 * loaded into memory, and a failed chunk is retried instead of restarting the whole upload.
 *
 * @param {string} filePath
 * @param {object} [options]
 * @param {boolean} [options.gzip] compress on the fly and upload as "<name>.gz"
 * @param {DriveClient} [options.client]
 * @returns {Promise<{ id: string, name: string, webViewLink?: string, size?: string }>}
 */
export async function uploadToDrive(filePath, { gzip = false, client = new DriveClient() } = {}) {
  const { size } = await stat(filePath);
  const name = path.basename(filePath) + (gzip ? '.gz' : '');
  const mimeType = gzip ? 'application/gzip' : 'application/json';

  const folderId = await client.findOrCreateFolder();
  if (!gzip) await client.checkQuota(size);

  const sessionUrl = await startSession(client, { name, mimeType, parents: [folderId] }, gzip ? null : size);

  // Progress is measured on the original file, so it is meaningful for gzip as well.
  const progress = new ProgressPrinter('Uploading', size);
  let readBytes = 0;
  const counter = new Transform({
    transform(chunk, encoding, callback) {
      readBytes += chunk.length;
      progress.update(readBytes);
      callback(null, chunk);
    },
  });
  const streams = [createFileReadStream(filePath), counter];
  if (gzip) streams.push(createGzip());
  // pipeline() returns the last stream; an error in any stage destroys it, so the loop below rejects.
  const input = pipeline(...streams, () => {});

  try {
    const file = await uploadChunks(client, sessionUrl, input, gzip ? null : size);
    progress.done(size);
    return file;
  } finally {
    input.destroy();
  }
}

async function startSession(client, metadata, size) {
  const headers = {
    ...(await client.authHeaders()),
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Type': metadata.mimeType,
  };
  if (size !== null) headers['X-Upload-Content-Length'] = String(size);

  const response = await fetchWithRetry(`${UPLOAD_URL}?uploadType=resumable&fields=id,name,size,webViewLink`, {
    method: 'POST',
    headers,
    body: JSON.stringify(metadata),
  });
  if (!response.ok) throw await responseError('Could not start the upload', response);
  return response.headers.get('location');
}

/**
 * Reads the stream, cuts it into CHUNK_SIZE pieces and PUTs them one by one.
 * A chunk is sent only when more data is known to follow, so the last chunk
 * can always be marked as final (needed when the total size is unknown, e.g. gzip).
 */
async function uploadChunks(client, sessionUrl, input, totalSize) {
  let buffered = [];
  let bufferedBytes = 0;
  let offset = 0;

  for await (const data of input) {
    buffered.push(data);
    bufferedBytes += data.length;
    while (bufferedBytes > CHUNK_SIZE) {
      const all = Buffer.concat(buffered, bufferedBytes);
      await sendChunk(client, sessionUrl, all.subarray(0, CHUNK_SIZE), offset, totalSize, false);
      offset += CHUNK_SIZE;
      buffered = [all.subarray(CHUNK_SIZE)];
      bufferedBytes -= CHUNK_SIZE;
    }
  }

  const last = Buffer.concat(buffered, bufferedBytes);
  return sendChunk(client, sessionUrl, last, offset, offset + last.length, true);
}

async function sendChunk(client, sessionUrl, chunk, offset, totalSize, isLast) {
  let sent = 0; // bytes of this chunk already confirmed by the server

  for (let attempt = 0; ; attempt++) {
    const total = isLast ? String(offset + chunk.length) : totalSize === null ? '*' : String(totalSize);
    const body = chunk.subarray(sent);
    const range =
      body.length > 0
        ? `bytes ${offset + sent}-${offset + chunk.length - 1}/${total}`
        : `bytes */${total}`;

    let response;
    try {
      response = await fetch(sessionUrl, {
        method: 'PUT',
        headers: { ...(await client.authHeaders()), 'Content-Range': range },
        body,
      });
    } catch (err) {
      response = null;
      if (attempt >= MAX_RETRIES) throw new DriveError(`Upload failed: ${err.message}`, { cause: err });
    }

    if (response) {
      if (response.status === 200 || response.status === 201) return response.json();
      if (response.status === 308 && !isLast) {
        // Chunk accepted, server waits for more.
        const confirmed = rangeEnd(response) + 1;
        if (confirmed >= offset + chunk.length) return null;
        sent = Math.max(0, confirmed - offset);
        continue;
      }
      if (response.status === 404 || response.status === 410) {
        throw new DriveError('Upload session expired, please run the upload again');
      }
      const retryable = response.status === 429 || response.status >= 500 || response.status === 308;
      if (!retryable || attempt >= MAX_RETRIES) throw await responseError('Upload failed', response);
    }

    // Before retrying, ask the server how many bytes it actually received.
    await sleep(Math.min(1000 * 2 ** attempt, 30_000));
    sent = await queryReceived(client, sessionUrl, offset, chunk.length, totalSize, isLast);
  }
}

async function queryReceived(client, sessionUrl, offset, chunkLength, totalSize, isLast) {
  const total = isLast ? String(offset + chunkLength) : totalSize === null ? '*' : String(totalSize);
  try {
    const response = await fetch(sessionUrl, {
      method: 'PUT',
      headers: { ...(await client.authHeaders()), 'Content-Range': `bytes */${total}` },
    });
    if (response.status === 308) return Math.max(0, rangeEnd(response) + 1 - offset);
  } catch {
    // network still down: resend the whole chunk on the next attempt
  }
  return 0;
}

/** Parses the "Range: bytes=0-12345" header of a 308 response; -1 if nothing was received. */
function rangeEnd(response) {
  const range = response.headers.get('range');
  const match = range && /bytes=\d+-(\d+)/.exec(range);
  return match ? Number(match[1]) : -1;
}

async function fetchWithRetry(url, options) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, options);
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      return response;
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw new DriveError(`Network error: ${err.message}`, { cause: err });
      await sleep(1000 * 2 ** attempt);
    }
  }
}

async function responseError(prefix, response) {
  const text = await response.text().catch(() => '');
  let message = text;
  try {
    message = JSON.parse(text).error?.message ?? text;
  } catch {
    // not JSON
  }
  return new DriveError(`${prefix}: HTTP ${response.status} ${message}`.trim());
}
