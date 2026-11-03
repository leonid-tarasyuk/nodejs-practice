import { Transform } from 'node:stream';
import { formatBytes, formatDuration } from './format.js';

/** Console output used by every layer. Messages go to stdout, warnings and errors to stderr. */
export const logger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(`Warning: ${message}`),
  error: (message) => console.error(`Error: ${message}`),
  debug: (value) => {
    if (process.env.DEBUG) console.error(value);
  },
};

/**
 * Prints a progress line to stderr, at most every `interval` ms.
 * On a terminal the line is updated in place; otherwise a new line is printed.
 * Turned off with NO_PROGRESS=1.
 */
export class ProgressPrinter {
  constructor(label, total, interval = 500) {
    this.label = label;
    this.total = total;
    this.interval = interval;
    this.startedAt = Date.now();
    this.lastPrint = Date.now();
    this.enabled = !process.env.NO_PROGRESS;
  }

  update(done, force = false) {
    if (!this.enabled) return;
    const now = Date.now();
    if (!force && now - this.lastPrint < (process.stderr.isTTY ? this.interval : 10_000)) return;
    this.lastPrint = now;

    const elapsed = (now - this.startedAt) / 1000;
    const speed = elapsed > 0 ? done / elapsed : 0;
    let line = `${this.label}: ${formatBytes(done)}`;
    if (this.total) {
      const pct = Math.min(100, (done / this.total) * 100);
      line += ` / ${formatBytes(this.total)} (${pct.toFixed(1)}%)`;
      if (speed > 0 && done < this.total) line += `, ETA ${formatDuration(((this.total - done) / speed) * 1000)}`;
    }
    line += `, ${formatBytes(speed)}/s`;

    if (process.stderr.isTTY) process.stderr.write(`\r${line}\x1b[K`);
    else process.stderr.write(`${line}\n`);
  }

  done(total) {
    this.update(total, true);
    if (this.enabled && process.stderr.isTTY) process.stderr.write('\n');
  }
}

/** Pass-through stream that counts bytes flowing through it and reports progress. */
export function createProgressStream(label, total) {
  const printer = new ProgressPrinter(label, total);
  let bytes = 0;
  return new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      printer.update(bytes);
      callback(null, chunk);
    },
    flush(callback) {
      printer.done(bytes);
      callback();
    },
  });
}
