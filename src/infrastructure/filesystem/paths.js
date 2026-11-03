import { UsageError } from '../../utils/errors.js';
import { checkReadableFile } from './file-reader.js';
import { checkWritableTarget } from './file-writer.js';

/**
 * Validates the source and result paths before any work starts.
 * @returns {Promise<{ source: string, result: string, sourceSize: number }>}
 */
export async function validatePaths(sourceFile, resultFile) {
  const { path: source, size } = await checkReadableFile(sourceFile);
  const result = await checkWritableTarget(resultFile);
  if (source === result) throw new UsageError('Source and result files must be different');
  return { source, result, sourceSize: size };
}
