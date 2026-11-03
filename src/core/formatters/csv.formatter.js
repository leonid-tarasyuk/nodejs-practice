/**
 * Serializes values into a single CSV record (without the line break).
 * A value is quoted when it contains the delimiter, a quote, a line break
 * or leading/trailing whitespace; quotes inside are doubled.
 *
 * @param {string[]} values
 * @param {string} delimiter
 */
export function formatCsvRow(values, delimiter) {
  let out = '';
  for (let i = 0; i < values.length; i++) {
    if (i > 0) out += delimiter;
    out += formatCsvField(values[i], delimiter);
  }
  return out;
}

export function formatCsvField(value, delimiter) {
  if (
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r') ||
    (value.length > 0 && (value[0] === ' ' || value[value.length - 1] === ' '))
  ) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}
