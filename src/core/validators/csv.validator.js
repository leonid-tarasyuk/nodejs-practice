import { CsvError } from '../../utils/errors.js';

/**
 * Trims the header fields and checks that every column has a unique, non-empty name.
 * @param {string[]} fields raw header record
 * @param {number} line line number of the header (for error messages)
 * @returns {string[]} column names
 */
export function validateCsvHeader(fields, line) {
  const headers = fields.map((h) => h.trim());
  const seen = new Set();
  headers.forEach((h, i) => {
    if (h === '') throw new CsvError(`column #${i + 1} in the header has an empty name`, line);
    if (seen.has(h)) throw new CsvError(`duplicate column name "${h}" in the header`, line);
    seen.add(h);
  });
  return headers;
}

/** True when a data record has the same number of fields as the header. */
export function hasExpectedColumns(fields, headers) {
  return fields.length === headers.length;
}
