import { CsvError } from '../../utils/errors.js';

const QUOTE = 34; // "
const LF = 10; // \n
const CR = 13; // \r

// Parser states
const FIELD_START = 0; // nothing read for the current field yet
const UNQUOTED = 1; // inside an unquoted field
const QUOTED = 2; // inside a quoted field
const QUOTE_IN_QUOTED = 3; // saw a quote inside a quoted field: either an escaped "" or the closing quote
const AFTER_QUOTED = 4; // the quoted field is closed, a delimiter or line break must follow

/**
 * Incremental RFC 4180 CSV parser.
 *
 * Text is fed in arbitrary pieces (stream chunks), so a field, a quoted value or
 * even a "\r\n" pair can be split between two calls. All intermediate state lives
 * on the instance, which means only the current (unfinished) row is kept in memory.
 *
 * Supports: quoted fields, escaped quotes (""), delimiters and line breaks inside
 * quotes, LF and CRLF line endings, empty lines (skipped).
 */
export class CsvRowParser {
  /**
   * @param {object} options
   * @param {string} options.delimiter single character
   * @param {(fields: string[], line: number) => void} options.onRow called for every non-empty record
   */
  constructor({ delimiter, onRow }) {
    if (typeof delimiter !== 'string' || delimiter.length !== 1) {
      throw new TypeError('Delimiter must be a single character');
    }
    this.delimiter = delimiter.charCodeAt(0);
    this.onRow = onRow;

    this.state = FIELD_START;
    this.field = '';
    this.row = [];
    this.skipLF = false; // previous chunk ended with \r, a following \n belongs to it
    this.line = 1; // current physical line (for error messages)
    this.rowStartLine = 1; // line where the current record started
    this.quoteStartLine = 0;
  }

  /** @param {string} text */
  feed(text) {
    const n = text.length;
    let i = 0;

    while (i < n) {
      if (this.skipLF) {
        this.skipLF = false;
        if (text.charCodeAt(i) === LF) {
          i++;
          continue;
        }
      }

      if (this.state === QUOTED) {
        const q = text.indexOf('"', i);
        const piece = q === -1 ? text.slice(i) : text.slice(i, q);
        this.field += piece;
        this.countLines(piece);
        if (q === -1) return;
        i = q + 1;
        this.state = QUOTE_IN_QUOTED;
        continue;
      }

      const c = text.charCodeAt(i);

      if (this.state === QUOTE_IN_QUOTED) {
        if (c === QUOTE) {
          // "" inside quotes is an escaped quote
          this.field += '"';
          this.state = QUOTED;
          i++;
          continue;
        }
        this.state = AFTER_QUOTED;
      }

      if (this.state === AFTER_QUOTED) {
        if (c !== this.delimiter && c !== LF && c !== CR) {
          throw new CsvError(
            `Unexpected character ${JSON.stringify(text[i])} after closing quote`,
            this.line,
          );
        }
        this.endOfToken(c);
        i++;
        continue;
      }

      if (this.state === FIELD_START && c === QUOTE) {
        this.state = QUOTED;
        this.quoteStartLine = this.line;
        i++;
        continue;
      }

      // Unquoted field: scan ahead to the next special character and take the whole slice at once.
      let j = i;
      while (j < n) {
        const cc = text.charCodeAt(j);
        if (cc === this.delimiter || cc === LF || cc === CR) break;
        if (cc === QUOTE) {
          throw new CsvError(
            'Unexpected quote inside an unquoted field (fields containing quotes must be wrapped in quotes)',
            this.line,
          );
        }
        j++;
      }
      this.field += text.slice(i, j);
      if (j === n) {
        this.state = UNQUOTED;
        return;
      }
      this.endOfToken(text.charCodeAt(j));
      i = j + 1;
    }
  }

  /** Must be called once the input is over. Flushes the last record. */
  end() {
    if (this.state === QUOTED) {
      throw new CsvError('Unclosed quoted field (missing closing quote)', this.quoteStartLine);
    }
    if (this.state !== FIELD_START || this.field !== '' || this.row.length > 0) {
      this.endField();
      this.endRow();
    }
  }

  /** Handles a delimiter / CR / LF that terminates the current field. */
  endOfToken(c) {
    this.endField();
    if (c === this.delimiter) return;

    this.endRow();
    this.line++;
    if (c === CR) this.skipLF = true;
  }

  endField() {
    this.row.push(this.field);
    this.field = '';
    this.state = FIELD_START;
  }

  endRow() {
    const row = this.row;
    this.row = [];
    const startLine = this.rowStartLine;
    this.rowStartLine = this.line + 1;
    // An empty line produces a single empty field: skip it.
    if (row.length === 1 && row[0] === '') return;
    this.onRow(row, startLine);
  }

  countLines(piece) {
    for (let k = piece.indexOf('\n'); k !== -1; k = piece.indexOf('\n', k + 1)) this.line++;
  }
}
