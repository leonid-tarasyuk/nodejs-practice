#!/usr/bin/env node
import { runCommand } from './src/cli/index.js';
import { createConvertToCsvCommand } from './src/cli/commands/convert-to-csv.js';

await runCommand(createConvertToCsvCommand());
