import { CsvRowParser } from '../../core/parsers/csv.parser.js';
import { createCsvGeneratorStream } from '../../core/streams/csv-generator.stream.js';
import { createFileReadStream } from '../../infrastructure/filesystem/file-reader.js';
import { validatePaths } from '../../infrastructure/filesystem/paths.js';
import { CsvError, UsageError } from '../../utils/errors.js';
import { formatBytes } from '../../utils/format.js';
import { ProgressPrinter } from '../../utils/logger.js';
import { writeToFileAtomically } from '../workflows/conversion.workflow.js';
import { detectFileDelimiter } from './delimiter.service.js';

export const MAX_MOCK_SIZE = 50 * 1024 * 1024; // the mock is kept in memory, so it must be small

/** Reads the mock file with the same streaming parser that is used for conversion. */
export async function readMock(source, delimiter) {
  let header = null;
  const rows = [];
  const parser = new CsvRowParser({
    delimiter,
    onRow: (fields, line) => {
      if (!header) header = fields;
      else if (fields.length !== header.length) {
        throw new CsvError(`expected ${header.length} columns, got ${fields.length}`, line);
      } else rows.push(fields);
    },
  });
  for await (const chunk of createFileReadStream(source, { encoding: 'utf8' })) {
    parser.feed(chunk.replace(/^﻿/, ''));
  }
  parser.end();
  if (!header) throw new CsvError('mock file is empty');
  if (rows.length === 0) throw new CsvError('mock file has no data rows');
  return { header, rows };
}

/**
 * Generates a CSV file of at least `size` bytes by repeating the rows of a mock CSV file.
 *
 * @param {object} options
 * @param {string} options.sourceFile mock CSV file
 * @param {string} options.resultFile
 * @param {number} options.size minimal size in bytes
 * @param {string} [options.delimiter] delimiter of the mock (detected automatically when omitted)
 * @param {(mock: { rows: number, delimiter: string }) => void} [options.onMockLoaded]
 * @returns {Promise<{ result: string, rows: number, bytes: number, elapsed: number }>}
 */
export async function generateCsvFile({ sourceFile, resultFile, size, delimiter, onMockLoaded }) {
  const { source, result, sourceSize } = await validatePaths(sourceFile, resultFile);
  if (sourceSize > MAX_MOCK_SIZE) {
    throw new UsageError(`Mock file is too large (${formatBytes(sourceSize)}), maximum is ${formatBytes(MAX_MOCK_SIZE)}`);
  }

  delimiter ??= await detectFileDelimiter(source);
  const { header, rows } = await readMock(source, delimiter);
  onMockLoaded?.({ rows: rows.length, delimiter });

  const progress = new ProgressPrinter('Generating', size);
  const startedAt = Date.now();
  let bytes = 0;
  let rowsCount = 0;
  const onProgress = (written, finalRows) => {
    bytes = written;
    if (finalRows !== undefined) rowsCount = finalRows;
    progress.update(written);
  };

  await writeToFileAtomically(
    [createCsvGeneratorStream({ header, rows, delimiter, targetBytes: size, onProgress })],
    result,
    { highWaterMark: 4 * 1024 * 1024 },
  );
  progress.done(bytes);

  return { result, rows: rowsCount, bytes, elapsed: Date.now() - startedAt };
}
