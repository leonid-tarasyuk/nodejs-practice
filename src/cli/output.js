import { formatBytes, formatDuration } from '../utils/format.js';
import { logger } from '../utils/logger.js';

const MAX_WARNINGS = 10;

export function describeSeparator(separator) {
  return { '\t': 'tab', ' ': 'space' }[separator] ?? `"${separator}"`;
}

/** Returns an `onInvalidRow` handler that prints the first few skipped rows. */
export function invalidRowReporter(describe) {
  let shown = 0;
  return (info) => {
    if (shown++ < MAX_WARNINGS) logger.warn(`skipped ${describe(info)}`);
    else if (shown === MAX_WARNINGS + 1) logger.warn('more invalid rows skipped, see the summary');
  };
}

export function printConversionSummary({ result, stats, elapsed }) {
  logger.info(`Done in ${formatDuration(elapsed)}: ${stats.rows} rows, ${stats.columns} columns -> ${result}`);
  if (stats.skipped > 0) logger.info(`Skipped invalid rows: ${stats.skipped}`);
}

export function printUploadResult(file) {
  const size = file.size ? ` (${formatBytes(Number(file.size))})` : '';
  logger.info(`Uploaded "${file.name}"${size}, id: ${file.id}`);
  if (file.webViewLink) logger.info(`Link: ${file.webViewLink}`);
}
