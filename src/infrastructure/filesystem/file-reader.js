import { createReadStream } from 'node:fs';
import { access, constants, open, stat } from 'node:fs/promises';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { UsageError } from '../../utils/errors.js';

const READ_CHUNK = 1024 * 1024;

/**
 * Checks that the source exists, is a regular file and is readable,
 * so the user gets a clear message instead of a failure in the middle of a stream.
 * @returns {Promise<{ path: string, size: number }>}
 */
export async function checkReadableFile(sourceFile) {
  const source = path.resolve(sourceFile);

  let sourceStat;
  try {
    sourceStat = await stat(source);
  } catch (err) {
    if (err.code === 'ENOENT') throw new UsageError(`Source file not found: "${sourceFile}"`);
    throw err;
  }
  if (!sourceStat.isFile()) throw new UsageError(`Source path is not a file: "${sourceFile}"`);
  try {
    await access(source, constants.R_OK);
  } catch {
    throw new UsageError(`Source file is not readable: "${sourceFile}"`);
  }
  return { path: source, size: sourceStat.size };
}

/** Byte stream of the file, read in 1 MB chunks. */
export function createFileReadStream(filePath, options = {}) {
  return createReadStream(filePath, { highWaterMark: READ_CHUNK, ...options });
}

/**
 * Reads the first `bytes` bytes of a file as UTF-8 text.
 * @returns {Promise<{ text: string, isComplete: boolean }>} `isComplete` is true if the whole file was read
 */
export async function readFileHead(filePath, bytes) {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    // StringDecoder drops a multi-byte character cut at the end of the sample instead of producing garbage.
    const text = new StringDecoder('utf8').write(buffer.subarray(0, bytesRead));
    return { text, isComplete: bytesRead < bytes };
  } finally {
    await handle.close();
  }
}
