import { createWriteStream } from 'node:fs';
import { access, constants, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { UsageError } from '../../utils/errors.js';

const WRITE_BUFFER = 1024 * 1024;

/**
 * Checks that the result can be written: its directory exists and is writable,
 * and the path itself is not a directory.
 * @returns {Promise<string>} absolute result path
 */
export async function checkWritableTarget(resultFile) {
  const result = path.resolve(resultFile);

  const resultDir = path.dirname(result);
  const dirStat = await stat(resultDir).catch(() => null);
  if (!dirStat?.isDirectory()) throw new UsageError(`Result directory does not exist: "${resultDir}"`);
  try {
    await access(resultDir, constants.W_OK);
  } catch {
    throw new UsageError(`Result directory is not writable: "${resultDir}"`);
  }

  const resultStat = await stat(result).catch(() => null);
  if (resultStat?.isDirectory()) throw new UsageError(`Result path is a directory: "${resultFile}"`);

  return result;
}

/**
 * The result is first written to "<name>.part" and renamed only after a successful
 * run, so a failed run never leaves a half-written file under the final name.
 */
export function tempPathFor(result) {
  return `${result}.part`;
}

export function createFileWriteStream(filePath, { highWaterMark = WRITE_BUFFER } = {}) {
  return createWriteStream(filePath, { highWaterMark });
}

export async function commitTempFile(tempPath, result) {
  await rename(tempPath, result);
}

export async function removeQuietly(filePath) {
  await rm(filePath, { force: true }).catch(() => {});
}
