import { JsonError } from '../../utils/errors.js';

const BEFORE_ARRAY = 0; // waiting for "["
const EXPECT_ELEMENT = 1; // after "[" or ",": waiting for "{" (or "]" right after "[")
const IN_ELEMENT = 2; // inside an object, collecting its text
const AFTER_ELEMENT = 3; // waiting for "," or "]"
const DONE = 4; // after the closing "]": only whitespace is allowed

// Protects against unbounded memory growth on a broken file (e.g. an object that is never closed).
const MAX_ELEMENT_LENGTH = 64 * 1024 * 1024;

const isWhitespace = (c) => c === 32 || c === 10 || c === 13 || c === 9;

/**
 * Incremental parser for a top-level JSON array of objects.
 *
 * The array is never parsed as a whole: a small scanner tracks bracket depth and
 * string/escape state to find where each top-level element ends, and only that
 * element is passed to JSON.parse. Text can be fed in arbitrary pieces.
 */
export class JsonArrayParser {
  /**
   * @param {object} options
   * @param {(value: object, index: number) => void} options.onElement called for every element (1-based index)
   */
  constructor({ onElement }) {
    this.onElement = onElement;
    this.state = BEFORE_ARRAY;
    this.allowEnd = false; // "]" is allowed right after "[" but not after ","
    this.element = ''; // text of the current element
    this.depth = 0;
    this.inString = false;
    this.escaped = false;
    this.count = 0; // elements seen so far
  }

  /** @param {string} text */
  feed(text) {
    const n = text.length;
    let start = -1; // where the current element begins in this piece

    for (let i = 0; i < n; i++) {
      const c = text.charCodeAt(i);

      if (this.state === IN_ELEMENT) {
        if (start === -1) start = i;
        if (this.inString) {
          if (this.escaped) this.escaped = false;
          else if (c === 92 /* \ */) this.escaped = true;
          else if (c === 34 /* " */) this.inString = false;
          continue;
        }
        if (c === 34) this.inString = true;
        else if (c === 123 /* { */ || c === 91 /* [ */) this.depth++;
        else if (c === 125 /* } */ || c === 93 /* ] */) {
          this.depth--;
          if (this.depth === 0) {
            this.element += text.slice(start, i + 1);
            start = -1;
            this.emitElement(this.element);
            this.element = '';
            this.state = AFTER_ELEMENT;
          }
        }
        continue;
      }

      if (isWhitespace(c)) continue;
      const ch = text[i];

      switch (this.state) {
        case BEFORE_ARRAY:
          if (ch !== '[') throw new JsonError(`expected "[" at the beginning, got ${JSON.stringify(ch)}`);
          this.state = EXPECT_ELEMENT;
          this.allowEnd = true;
          break;
        case EXPECT_ELEMENT:
          if (ch === ']' && this.allowEnd) {
            this.state = DONE;
          } else if (ch === '{') {
            this.state = IN_ELEMENT;
            this.depth = 1;
            start = i;
          } else if (ch === ']') {
            throw new JsonError('trailing comma before "]"');
          } else {
            throw new JsonError(`expected an object, got ${JSON.stringify(ch)}`, this.count + 1);
          }
          break;
        case AFTER_ELEMENT:
          if (ch === ',') {
            this.state = EXPECT_ELEMENT;
            this.allowEnd = false; // trailing comma is not valid JSON
          } else if (ch === ']') {
            this.state = DONE;
          } else {
            throw new JsonError(`expected "," or "]" after an element, got ${JSON.stringify(ch)}`);
          }
          break;
        case DONE:
          throw new JsonError(`unexpected ${JSON.stringify(ch)} after the end of the array`);
      }
    }

    if (this.state === IN_ELEMENT && start !== -1) {
      this.element += text.slice(start);
      if (this.element.length > MAX_ELEMENT_LENGTH) {
        throw new JsonError('array element is too large (over 64 MB), is the object closed?', this.count + 1);
      }
    }
  }

  /** Must be called once the input is over. */
  end() {
    if (this.state === BEFORE_ARRAY) throw new JsonError('input is empty, expected an array of objects');
    if (this.state !== DONE) throw new JsonError('unexpected end of input, the array is not closed');
  }

  emitElement(text) {
    const index = ++this.count;
    let value;
    try {
      value = JSON.parse(text);
    } catch (err) {
      throw new JsonError(err.message, index);
    }
    this.onElement(value, index);
  }
}
