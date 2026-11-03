import { JsonToCsvTransform } from '../../core/streams/json-to-csv.stream.js';
import { validatePaths } from '../../infrastructure/filesystem/paths.js';
import { convertFile } from '../workflows/conversion.workflow.js';

/**
 * Converts a JSON array of objects to CSV.
 *
 * @param {object} options
 * @param {string} options.sourceFile
 * @param {string} options.resultFile
 * @param {string} [options.delimiter]
 * @param {boolean} [options.skipInvalid] skip objects with keys that are not in the first object
 * @param {(info: { element: number, key: string }) => void} [options.onInvalidRow]
 * @returns {Promise<{ result: string, stats: { rows: number, columns: number, skipped: number }, elapsed: number }>}
 */
export async function convertJsonToCsv({ sourceFile, resultFile, delimiter = ',', skipInvalid = false, onInvalidRow }) {
  const { source, result, sourceSize } = await validatePaths(sourceFile, resultFile);

  const transform = new JsonToCsvTransform({ delimiter, skipInvalid });
  if (onInvalidRow) transform.on('invalidRow', onInvalidRow);

  const elapsed = await convertFile({ source, result, sourceSize, transform });
  return { result, stats: transform.stats, elapsed };
}
