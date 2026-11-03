import { Command } from 'commander';
import { convertCsvToJson } from '../../application/services/csv-to-json.service.js';
import { uploadFile } from '../../application/services/upload.service.js';
import { logger } from '../../utils/logger.js';
import { parseSeparator } from '../options.js';
import { describeSeparator, invalidRowReporter, printConversionSummary, printUploadResult } from '../output.js';

export function createConvertToJsonCommand() {
  return new Command()
    .name('csv-to-json')
    .description('Convert a CSV file to JSON (stream-based) and upload the result to Google Drive')
    .requiredOption('-s, --sourceFile <path>', 'path to the source CSV file')
    .requiredOption('-r, --resultFile <path>', 'path to the resulting JSON file')
    .option(
      '-d, --separator <char>',
      'CSV delimiter: a single character or tab|space|comma|semicolon|pipe (detected automatically if omitted)',
      parseSeparator,
    )
    .option('--skip-invalid', 'skip rows with a wrong number of columns instead of failing')
    .option('--no-upload', 'do not upload the result to Google Drive')
    .option('--gzip', 'compress the JSON with gzip while uploading to Google Drive')
    .showHelpAfterError()
    .addHelpText(
      'after',
      `
Examples:
  node csvToJson.js --sourceFile "source.csv" --resultFile "result.json" --separator ","
  node csvToJson.js --sourceFile "source.csv" --resultFile "result.json" --separator " "
  node csvToJson.js --sourceFile "source.csv" --resultFile "result.json"`,
    )
    .action(async (options) => {
      const summary = await convertCsvToJson({
        sourceFile: options.sourceFile,
        resultFile: options.resultFile,
        delimiter: options.separator,
        skipInvalid: options.skipInvalid,
        onDelimiterDetected: (d) => logger.info(`Detected separator: ${describeSeparator(d)}`),
        onInvalidRow: invalidRowReporter(
          ({ line, expected, actual }) => `line ${line}: expected ${expected} columns, got ${actual}`,
        ),
      });
      printConversionSummary(summary);

      if (options.upload) {
        logger.info(`Uploading ${summary.result}${options.gzip ? ' (gzip)' : ''} to Google Drive...`);
        printUploadResult(await uploadFile(summary.result, { gzip: options.gzip }));
      }
    });
}
