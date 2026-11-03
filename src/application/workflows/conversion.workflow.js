import { pipeline } from 'node:stream/promises';
import {
  commitTempFile,
  createFileWriteStream,
  removeQuietly,
  tempPathFor,
} from '../../infrastructure/filesystem/file-writer.js';
import { createFileReadStream } from '../../infrastructure/filesystem/file-reader.js';
import { UsageError } from '../../utils/errors.js';
import { createProgressStream } from '../../utils/logger.js';

/**
 * Pipes `streams` into `result` atomically: the data goes to "<result>.part", which is
 * renamed only on success and removed on failure or Ctrl+C. stream.pipeline handles
 * backpressure and error propagation between the stages.
 *
 * @param {import('node:stream').Stream[]} streams source stream followed by any transforms
 * @param {string} result
 * @param {object} [options]
 * @param {number} [options.highWaterMark] write buffer size
 */
export async function writeToFileAtomically(streams, result, { highWaterMark } = {}) {
  const tempPath = tempPathFor(result);
  const controller = new AbortController();
  const onSigint = () => controller.abort(new UsageError('Interrupted by user'));
  process.once('SIGINT', onSigint);

  try {
    await pipeline(...streams, createFileWriteStream(tempPath, { highWaterMark }), { signal: controller.signal });
    await commitTempFile(tempPath, result);
  } catch (err) {
    await removeQuietly(tempPath);
    throw controller.signal.aborted ? controller.signal.reason : err;
  } finally {
    process.off('SIGINT', onSigint);
  }
}

/**
 * Conversion workflow shared by both converters:
 * file (1 MB chunks) → progress → `transform` → "<result>.part" → rename to result.
 *
 * @returns {Promise<number>} elapsed time in ms
 */
export async function convertFile({ source, result, sourceSize, transform }) {
  const startedAt = Date.now();
  await writeToFileAtomically(
    [createFileReadStream(source), createProgressStream('Converting', sourceSize), transform],
    result,
  );
  return Date.now() - startedAt;
}
