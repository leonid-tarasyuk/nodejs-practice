/** Base class for errors whose message can be shown to the user as is. */
export class AppError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

/** Invalid command-line arguments or configuration. */
export class UsageError extends AppError {}

/** Invalid CSV data. */
export class CsvError extends AppError {
  constructor(message, line) {
    super(line ? `Invalid CSV at line ${line}: ${message}` : `Invalid CSV: ${message}`);
    this.line = line;
  }
}

/** Invalid JSON data. */
export class JsonError extends AppError {
  constructor(message, element) {
    super(element ? `Invalid JSON in array element #${element}: ${message}` : `Invalid JSON: ${message}`);
    this.element = element;
  }
}

/** Google Drive upload/configuration problems. */
export class DriveError extends AppError {}

const FS_MESSAGES = {
  ENOENT: 'no such file or directory',
  EACCES: 'permission denied',
  EPERM: 'operation not permitted',
  EISDIR: 'is a directory, expected a file',
  ENOTDIR: 'a path component is not a directory',
  ENOSPC: 'no space left on device',
  EMFILE: 'too many open files',
  EBUSY: 'file is busy or locked by another process',
  EROFS: 'read-only file system',
};

/** Turns any error into a human-readable one-line message. */
export function describeError(err) {
  if (err instanceof AppError) return err.message;
  if (err && typeof err.code === 'string' && FS_MESSAGES[err.code]) {
    const where = err.path ? ` "${err.path}"` : '';
    return `File system error${where}: ${FS_MESSAGES[err.code]} (${err.code})`;
  }
  return err?.message ?? String(err);
}
