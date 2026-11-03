import { InvalidArgumentError } from 'commander';

const SEPARATOR_ALIASES = { '\\t': '\t', tab: '\t', space: ' ', comma: ',', semicolon: ';', pipe: '|' };

/** Commander argument parser for --separator. */
export function parseSeparator(value) {
  const separator = SEPARATOR_ALIASES[value.toLowerCase()] ?? value;
  if (separator.length !== 1) {
    throw new InvalidArgumentError('must be a single character (or one of: tab, space, comma, semicolon, pipe).');
  }
  if (separator === '"' || separator === '\n' || separator === '\r') {
    throw new InvalidArgumentError('quote and line break characters cannot be used as a separator.');
  }
  return separator;
}

/** Commander argument parser for sizes like "500MB" or "10GB". */
export function parseSize(value) {
  const match = /^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)?$/i.exec(value.trim());
  if (!match) throw new InvalidArgumentError('expected a size like 500MB, 10GB.');
  const power = { B: 0, KB: 1, MB: 2, GB: 3, TB: 4 }[(match[2] ?? 'B').toUpperCase()];
  const bytes = Math.floor(Number(match[1]) * 1024 ** power);
  if (bytes <= 0) throw new InvalidArgumentError('size must be greater than zero.');
  return bytes;
}
