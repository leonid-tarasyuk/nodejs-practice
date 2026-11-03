import { Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { JsonError } from '../../utils/errors.js';
import { formatCsvRow } from '../formatters/csv.formatter.js';
import { JsonArrayParser } from '../parsers/json-array.parser.js';

/**
 * Transform stream: JSON text in -> CSV text out.
 *
 * Input must be a JSON array of objects. JsonArrayParser finds the boundaries of each
 * top-level element and parses only that element, so the document is never held in memory.
 * The header is taken from the keys of the first object.
 */
export class JsonToCsvTransform extends Transform {
  /**
   * @param {object} options
   * @param {string} options.delimiter
   * @param {boolean} [options.skipInvalid] skip objects with unknown keys instead of failing
   */
  constructor({ delimiter, skipInvalid = false }) {
    super();
    this.delimiter = delimiter;
    this.skipInvalid = skipInvalid;
    this.decoder = new StringDecoder('utf8');
    this.parser = new JsonArrayParser({ onElement: (obj, index) => this.handleElement(obj, index) });
    this.firstChunk = true;

    this.headers = null;
    this.headerSet = null;
    this.output = '';
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
      this.pushOutput();
      callback();
    } catch (err) {
      callback(err);
    }
  }

  handleElement(obj, index) {
    if (!this.headers) {
      this.headers = Object.keys(obj);
      if (this.headers.length === 0) throw new JsonError('the first object has no keys, cannot build a header', index);
      this.headerSet = new Set(this.headers);
      this.stats.columns = this.headers.length;
      this.output += formatCsvRow(this.headers, this.delimiter) + '\n';
    } else {
      const unknown = Object.keys(obj).find((k) => !this.headerSet.has(k));
      if (unknown !== undefined) {
        if (this.skipInvalid) {
          this.stats.skipped++;
          this.emit('invalidRow', { element: index, key: unknown });
          return;
        }
        throw new JsonError(`unknown key "${unknown}" (not present in the first object)`, index);
      }
    }

    const values = this.headers.map((key) => toCell(obj[key]));
    this.output += formatCsvRow(values, this.delimiter) + '\n';
    this.stats.rows++;
  }

  pushOutput() {
    if (this.output.length > 0) {
      this.push(this.output);
      this.output = '';
    }
  }
}

function toCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
