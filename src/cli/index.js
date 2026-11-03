import { UsageError, describeError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Parses process.argv with a commander command and runs its action.
 * Any error from the action becomes a readable message and a non-zero exit code:
 * UsageError → 2, anything else → 1. (Commander's own argument errors exit with 1 before the action runs.)
 *
 * @param {import('commander').Command} command
 * @param {string[]} [argv]
 */
export async function runCommand(command, argv = process.argv) {
  await runMain(() => command.parseAsync(argv));
}

/** Runs `main` and turns any error into a readable message and a non-zero exit code. */
export async function runMain(main) {
  try {
    await main();
  } catch (err) {
    if (process.stderr.isTTY) process.stderr.write('\n');
    logger.error(describeError(err));
    logger.debug(err);
    process.exitCode = err instanceof UsageError ? 2 : 1;
  }
}
