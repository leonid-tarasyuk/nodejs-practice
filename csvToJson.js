#!/usr/bin/env node
import { runCommand } from './src/cli/index.js';
import { createConvertToJsonCommand } from './src/cli/commands/convert-to-json.js';

await runCommand(createConvertToJsonCommand());
