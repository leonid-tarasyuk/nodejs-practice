import { Command } from 'commander';
import { convertJsonToCsv } from '../../application/services/json-to-csv.service.js';
import { parseSeparator } from '../options.js';
import { invalidRowReporter, printConversionSummary } from '../output.js';

export function createConvertToCsvCommand() {
  return new Command()
    .name('json-to-csv')
    .description('Convert a JSON array of objects to CSV (stream-based)')
    .requiredOption('-s, --sourceFile <path>', 'path to the source JSON file')
    .requiredOption('-r, --resultFile <path>', 'path to the resulting CSV file')
    .option(
      '-d, --separator <char>',
      'CSV delimiter: a single character or tab|space|comma|semicolon|pipe',
      parseSeparator,
      ',',
    )
    .option('--skip-invalid', 'skip objects with keys that are not in the first object instead of failing')
    .showHelpAfterError()
    .addHelpText('after', '\nExample:\n  node jsonToCsv.js --sourceFile "result.json" --resultFile "back.csv" --separator ";"')
    .action(async (options) => {
      const summary = await convertJsonToCsv({
        sourceFile: options.sourceFile,
        resultFile: options.resultFile,
        delimiter: options.separator,
        skipInvalid: options.skipInvalid,
        onInvalidRow: invalidRowReporter(({ element, key }) => `array element #${element}: unknown key "${key}"`),
      });
      printConversionSummary(summary);
    });
}
