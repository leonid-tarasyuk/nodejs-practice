#!/usr/bin/env node
/**
 * Generates a large CSV file (10 GB by default) by repeating the rows of a mock CSV file.
 * Used to demonstrate that the converters process huge files with constant memory.
 */
import { Command } from 'commander';
import { generateCsvFile } from '../src/application/services/generate-csv.service.js';
import { runCommand } from '../src/cli/index.js';
import { parseSeparator, parseSize } from '../src/cli/options.js';
import { describeSeparator } from '../src/cli/output.js';
import { formatBytes, formatDuration } from '../src/utils/format.js';
import { logger } from '../src/utils/logger.js';

const command = new Command()
  .name('generate-csv')
  .description('Generate a large CSV file by repeating the rows of a mock CSV file (stream-based)')
  .requiredOption('-s, --sourceFile <path>', 'path to the mock CSV file')
  .requiredOption('-r, --resultFile <path>', 'path to the generated CSV file')
  .option('--size <size>', 'minimal size of the generated file (B, KB, MB, GB, TB)', parseSize, parseSize('10GB'))
  .option('-d, --separator <char>', 'delimiter of the mock file (detected automatically if omitted)', parseSeparator)
  .showHelpAfterError()
  .addHelpText(
    'after',
    '\nExample:\n  node scripts/generate-mock-csv.js --sourceFile data/mock.csv --resultFile data/large.csv --size 10GB',
  )
  .action(async (options) => {
    const { result, rows, bytes, elapsed } = await generateCsvFile({
      sourceFile: options.sourceFile,
      resultFile: options.resultFile,
      size: options.size,
      delimiter: options.separator,
      onMockLoaded: (mock) =>
        logger.info(
          `Mock: ${mock.rows} rows, separator ${describeSeparator(mock.delimiter)}. ` +
            `Generating at least ${formatBytes(options.size)}...`,
        ),
    });
    logger.info(`Done in ${formatDuration(elapsed)}: ${rows} rows, ${formatBytes(bytes)} -> ${result}`);
  });

await runCommand(command);
