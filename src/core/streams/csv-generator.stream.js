import { Readable } from 'node:stream';
import { formatCsvRow } from '../formatters/csv.formatter.js';

const BATCH_BYTES = 1024 * 1024; // size of one string pushed into the stream

/**
 * Readable stream of CSV text built by repeating `rows` until at least `targetBytes` are produced.
 * An incrementing `id` column is added unless the header already has one, so every row is unique.
 *
 * Readable.from() pulls the next ~1 MB batch only when the consumer asks for more data,
 * so memory usage stays constant (backpressure).
 *
 * @param {object} options
 * @param {string[]} options.header
 * @param {string[][]} options.rows
 * @param {string} options.delimiter
 * @param {number} options.targetBytes
 * @param {(bytes: number, rows?: number) => void} [options.onProgress] `rows` is passed only at the end
 */
export function createCsvGeneratorStream({ header, rows, delimiter, targetBytes, onProgress = () => {} }) {
  return Readable.from(generateCsv({ header, rows, delimiter, targetBytes, onProgress }));
}

async function* generateCsv({ header, rows, delimiter, targetBytes, onProgress }) {
  const addId = !header.includes('id');
  const head = formatCsvRow(addId ? ['id', ...header] : header, delimiter) + '\n';
  const lines = rows.map((r) => (addId ? delimiter : '') + formatCsvRow(r, delimiter) + '\n');

  let written = Buffer.byteLength(head);
  let batch = head;
  let count = 0;
  let rowIndex = 0;

  while (written < targetBytes) {
    count++;
    const line = addId ? count + lines[rowIndex] : lines[rowIndex];
    batch += line;
    written += Buffer.byteLength(line);
    rowIndex = (rowIndex + 1) % lines.length;

    if (batch.length >= BATCH_BYTES) {
      yield batch;
      batch = '';
      onProgress(written);
    }
  }
  if (batch) yield batch;
  onProgress(written, count);
}
