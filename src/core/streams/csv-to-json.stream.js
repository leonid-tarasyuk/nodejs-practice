import { Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { CsvError } from '../../utils/errors.js';
import { CsvRowParser } from '../parsers/csv.parser.js';
import { hasExpectedColumns, validateCsvHeader } from '../validators/csv.validator.js';

/**
 * Transform stream: CSV bytes in -> JSON text out.
 *
 * The first record is the header; every following record becomes an object
 * `{ [header]: value }`. The output is a pretty-printed JSON array that is
 * written incrementally, so memory usage does not depend on the file size.
 */
export class CsvToJsonTransform extends Transform {
  /**
   * @param {object} options
   * @param {string} options.delimiter
   * @param {boolean} [options.skipInvalid] skip rows with a wrong number of columns instead of failing
   */
  constructor({ delimiter, skipInvalid = false }) {
    super();
    this.skipInvalid = skipInvalid;
    this.decoder = new StringDecoder('utf8');
    this.parser = new CsvRowParser({ delimiter, onRow: (fields, line) => this.handleRow(fields, line) });

    this.headers = null;
    this.keyPrefixes = null; // pre-rendered `,\n    "key": ` strings
    this.firstChunk = true;
    // JSON pieces produced from the current input chunk; joining them once is
    // cheaper than growing a single string with += for every field.
    this.output = [];

    this.stats = { rows: 0, skipped: 0, columns: 0 };
  }

  _transform(chunk, encoding, callback) {
    try {
      let text = typeof chunk === 'string' ? chunk : this.decoder.write(chunk);
      if (this.firstChunk && text.length > 0) {
        this.firstChunk = false;
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // UTF-8 BOM
      }
      this.parser.feed(text);
      this.pushOutput();
      callback();
    } catch (err) {
      callback(err);
    }
  }

  _flush(callback) {
    try {
      this.parser.feed(this.decoder.end());
      this.parser.end();
      if (!this.headers) throw new CsvError('file is empty, a header row is required');
      this.output.push(this.stats.rows > 0 ? '\n]\n' : '[]\n');
      this.pushOutput();
      callback();
    } catch (err) {
      callback(err);
    }
  }

  handleRow(fields, line) {
    if (!this.headers) {
      this.setHeaders(fields, line);
      return;
    }

    if (!hasExpectedColumns(fields, this.headers)) {
      if (this.skipInvalid) {
        this.stats.skipped++;
        this.emit('invalidRow', { line, expected: this.headers.length, actual: fields.length });
        return;
      }
      throw new CsvError(`expected ${this.headers.length} columns, got ${fields.length}`, line);
    }

    const out = this.output;
    out.push(this.stats.rows === 0 ? '[\n  {\n' : ',\n  {\n');
    for (let i = 0; i < fields.length; i++) {
      out.push(this.keyPrefixes[i], JSON.stringify(fields[i]));
    }
    out.push('\n  }');
    this.stats.rows++;
  }

  setHeaders(fields, line) {
    const headers = validateCsvHeader(fields, line);
    this.headers = headers;
    this.keyPrefixes = headers.map((h, i) => `${i > 0 ? ',\n' : ''}    ${JSON.stringify(h)}: `);
    this.stats.columns = headers.length;
    this.emit('headers', headers);
  }

  pushOutput() {
    if (this.output.length > 0) {
      this.push(this.output.join(''));
      this.output = [];
    }
  }
}
