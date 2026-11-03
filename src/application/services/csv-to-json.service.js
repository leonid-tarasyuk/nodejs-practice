import { CsvToJsonTransform } from '../../core/streams/csv-to-json.stream.js';
import { validatePaths } from '../../infrastructure/filesystem/paths.js';
import { convertFile } from '../workflows/conversion.workflow.js';
import { detectFileDelimiter } from './delimiter.service.js';

/**
 * Converts a CSV file to a JSON array of objects.
 *
 * @param {object} options
 * @param {string} options.sourceFile
 * @param {string} options.resultFile
 * @param {string} [options.delimiter] detected automatically when omitted
 * @param {boolean} [options.skipInvalid] skip rows with a wrong number of columns instead of failing
 * @param {(delimiter: string) => void} [options.onDelimiterDetected]
 * @param {(info: { line: number, expected: number, actual: number }) => void} [options.onInvalidRow]
 * @returns {Promise<{ result: string, delimiter: string, stats: { rows: number, columns: number, skipped: number }, elapsed: number }>}
 */
export async function convertCsvToJson({
  sourceFile,
  resultFile,
  delimiter,
  skipInvalid = false,
  onDelimiterDetected,
  onInvalidRow,
}) {
  const { source, result, sourceSize } = await validatePaths(sourceFile, resultFile);

  if (delimiter === undefined) {
    delimiter = await detectFileDelimiter(source);
    onDelimiterDetected?.(delimiter);
  }

  const transform = new CsvToJsonTransform({ delimiter, skipInvalid });
  if (onInvalidRow) transform.on('invalidRow', onInvalidRow);

  const elapsed = await convertFile({ source, result, sourceSize, transform });
  return { result, delimiter, stats: transform.stats, elapsed };
}
