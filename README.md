# CSV ⇄ JSON stream converter

A Node.js CLI app that converts CSV files of any size to JSON and uploads the result to Google Drive.
It never loads a whole file into memory: data flows through Node.js streams, and the conversion
happens in a custom `Transform` stream. It can also convert JSON back to CSV and generate a 10 GB+ CSV
file for testing. The code is organized in layers (see [Architecture](#architecture)).

## Features

- **CSV → JSON** with a custom `Transform` stream (`src/core/streams/csv-to-json.stream.js`).
- **JSON → CSV** (reverse conversion, also a custom `Transform`): `src/core/streams/json-to-csv.stream.js`.
- Its own RFC 4180 CSV parser. It handles quoted fields, escaped quotes (`""`), delimiters and line breaks inside quotes,
  LF / CRLF / CR line endings, a UTF-8 BOM, and empty lines. Multi-byte UTF-8 characters split between chunks are decoded correctly.
- **Delimiter** comes from `--separator`, or is **detected automatically** from the first 64 KB of the file
  (candidates: `,` `;` tab `|` space).
- **Streaming**: memory usage stays the same for any file size. Backpressure is handled by `stream.pipeline`.
  A 1 GB file converts with the JS heap limited to 48 MB (`--max-old-space-size=48`).
- **Google Drive upload** through the resumable upload protocol. The file is sent in 8 MB chunks, failed chunks are
  retried, and you can turn on gzip compression during the upload.
- **Error handling**: invalid CLI arguments, missing or unreadable files, invalid CSV/JSON (with the line or element number),
  and Drive/auth errors. The result is first written to `<result>.part` and renamed only on success, so a failed
  or interrupted (Ctrl+C) run never leaves a broken result file.
- **Large file generator**: streams a CSV of any size (10 GB by default) built from the rows of a mock CSV file.
- **Layered architecture**: `cli` → `application` → `core` / `infrastructure`, where `core` holds pure logic with no I/O.

## Requirements

- Node.js **20+** (developed on Node.js 24)
- A Google account and a Google Cloud project (for the upload)
- About 40 GB of free disk space for the 10 GB demo

## Dependencies

Only the allowed third-party libraries are used:

| Package      | Purpose                                     |
|--------------|---------------------------------------------|
| `commander`  | command-line argument parsing               |
| `dotenv`     | loading Google credentials from `.env`      |
| `googleapis` | OAuth 2.0 client and Google Drive API       |

CSV/JSON parsing, streaming, gzip (`node:zlib`) and the HTTP requests for the resumable upload (`fetch`) use Node.js built-ins only.

## Installation

```bash
git clone https://github.com/leonid-tarasyuk/nodejs-practice.git
cd nodejs-practice
npm install
```

To use `csv-to-json`, `json-to-csv` and `generate-csv` as global commands, you can also run `npm link`.
Then, for example, `csv-to-json -s source.csv -r result.json` works from any directory.

## Quick start

Try the converters on the sample files without setting up Google Drive:

```bash
node csvToJson.js --sourceFile data/sample.csv --resultFile data/sample.json --no-upload
node csvToJson.js --sourceFile data/sample-semicolon.csv --resultFile data/sample-semicolon.json --no-upload
node jsonToCsv.js --sourceFile data/sample.json --resultFile data/back.csv
```

`data/sample.csv`, `data/sample-semicolon.csv` and `data/sample-space.csv` hold the same table with different
delimiters, so you can see automatic delimiter detection at work. The last command gives back a copy of `data/sample.csv`.
Run any command with `--help` to see all its options.

## Google Drive setup

1. Open [Google Cloud Console](https://console.cloud.google.com/), then create a project (or pick an existing one).
2. **APIs & Services → Library**: enable the **Google Drive API**.
3. **APIs & Services → OAuth consent screen**: configure it (External) and add your Google account as a **test user**.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**, application type **Desktop app**.
5. Copy `.env.example` to `.env` and fill in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
6. Run the one-time authorization:

   ```bash
   npm run auth
   ```

   Open the printed URL and allow access. The refresh token is saved to `.env` automatically.

The app asks only for the `drive.file` scope, so it can see only the files and folders it created itself.
Uploaded files go to the folder from `GOOGLE_DRIVE_FOLDER_NAME` (default `csv-to-json`), which is created if it doesn't exist.

Without this setup the conversion still works, and the app stops at the upload step with
`Error: Google Drive is not configured: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env (see README)`.
Use `--no-upload` to skip the upload.

> While the OAuth app is in "Testing" mode, Google expires refresh tokens after 7 days. If you see
> "refresh token is invalid or expired", run `npm run auth` again.

### `.env` variables

| Variable                   | Description                                         |
|----------------------------|-----------------------------------------------------|
| `GOOGLE_CLIENT_ID`         | OAuth client ID (Desktop app)                       |
| `GOOGLE_CLIENT_SECRET`     | OAuth client secret                                 |
| `GOOGLE_REFRESH_TOKEN`     | Filled in by `npm run auth`                         |
| `GOOGLE_DRIVE_FOLDER_NAME` | Drive folder for uploads (default `csv-to-json`)    |
| `AUTH_PORT`                | optional, local port for `npm run auth` (default `53682`) |

`.env` is read from the project directory, so the commands work from any working directory.

## Usage

### CSV → JSON

```bash
node csvToJson.js --sourceFile "source.csv" --resultFile "result.json" --separator ","
node csvToJson.js --sourceFile "source.csv" --resultFile "result.json" --separator " "
node csvToJson.js --sourceFile "source.csv" --resultFile "result.json"            # separator is detected
```

| Option                     | Description                                                                                  |
|----------------------------|----------------------------------------------------------------------------------------------|
| `-s, --sourceFile <path>`  | **required**, source CSV file                                                                |
| `-r, --resultFile <path>`  | **required**, resulting JSON file                                                            |
| `-d, --separator <char>`   | single character, or `tab`, `space`, `comma`, `semicolon`, `pipe`, `\t`. Detected automatically if omitted |
| `--skip-invalid`           | skip rows with a wrong number of columns (with a warning) instead of failing                 |
| `--no-upload`              | don't upload the result to Google Drive                                                      |
| `--gzip`                   | gzip the JSON on the fly while uploading (uploaded as `<name>.json.gz`, the local file stays uncompressed) |
| `-h, --help`               | show help                                                                                    |

Example: for

```csv
name,age,city
John,25,London
Jane,30,Paris
```

the result is (every value stays a string, as in the task):

```json
[
  {
    "name": "John",
    "age": "25",
    "city": "London"
  },
  {
    "name": "Jane",
    "age": "30",
    "city": "Paris"
  }
]
```

Column names are trimmed, and the header must not have empty or duplicate names. Empty lines are skipped. With
`--skip-invalid`, the first 10 skipped rows are printed as warnings and the total is shown in the summary.

### JSON → CSV

```bash
node jsonToCsv.js --sourceFile "result.json" --resultFile "back.csv" --separator ";"
```

| Option                     | Description                                                              |
|----------------------------|--------------------------------------------------------------------------|
| `-s, --sourceFile <path>`  | **required**, source JSON file (an array of objects)                     |
| `-r, --resultFile <path>`  | **required**, resulting CSV file                                         |
| `-d, --separator <char>`   | output delimiter, same values as for CSV → JSON, default `,`            |
| `--skip-invalid`           | skip objects with keys that aren't in the first object (with a warning)  |

The input must be a JSON array of objects. The header comes from the keys of the first object. A missing key or `null`
becomes an empty cell, a number or boolean is written as text, and a nested object or array is written as JSON text.
Values are quoted only when needed (delimiter, quote, line break, or a leading/trailing space).

### Generating a large CSV file

```bash
node scripts/generate-mock-csv.js --sourceFile data/mock.csv --resultFile data/large.csv --size 10GB
```

| Option                     | Description                                                       |
|----------------------------|-------------------------------------------------------------------|
| `-s, --sourceFile <path>`  | **required**, mock CSV file (up to 50 MB, its rows are repeated)  |
| `-r, --resultFile <path>`  | **required**, generated CSV file                                  |
| `--size <size>`            | minimal size: `B`, `KB`, `MB`, `GB`, `TB` (default `10GB`)        |
| `-d, --separator <char>`   | delimiter of the mock file, same values as above (detected if omitted) |

An incrementing `id` column is added as the first column, so every generated row is unique. If the mock already has
an `id` column, no column is added and its rows are repeated as they are.
The generated file uses the mock's delimiter, and it ends at the first row boundary after `--size` is reached.
The data is produced by an async generator wrapped in `Readable.from()`, so new rows are generated only
when the file stream is ready to accept them.

### npm scripts

| Script                  | What it does                                                        |
|-------------------------|---------------------------------------------------------------------|
| `npm run csv-to-json -- <options>` | CSV → JSON                                               |
| `npm run json-to-csv -- <options>` | JSON → CSV                                               |
| `npm run generate -- <options>`    | generate a CSV file                                      |
| `npm run generate:10gb` | `data/mock.csv` → `data/large.csv` (10 GB)                          |
| `npm run convert:10gb`  | `data/large.csv` → `data/large.json` + gzip upload to Google Drive  |
| `npm run auth`          | one-time Google authorization (`scripts/google-auth.js`)          |

Arguments after `--` are passed to the command, e.g. `npm run csv-to-json -- -s data/sample.csv -r out.json --no-upload`.

## Demo with a 10 GB file

```bash
npm run generate:10gb   # ~3 min, writes data/large.csv (10 GB)
npm run convert:10gb    # writes data/large.json (~28 GB) and uploads it to Drive as large.json.gz
```

The JSON is about 2.7 times larger than the CSV because every value is repeated with its key, so a 10 GB CSV gives roughly 28 GB of JSON.
That's more than the free 15 GB of Google Drive storage, which is why the demo uploads with `--gzip`. The repeated keys
compress very well. Without `--gzip`, the app checks your free Drive space before uploading and stops with a clear message if the file won't fit.
Make sure the disk has about 40 GB free.

Measured on a laptop (Node.js 24, Windows 11) with a 1 GB CSV (12 million rows):

| Step                 | Time  | Peak RSS |
|----------------------|-------|----------|
| generate 1 GB CSV    | 19 s  | ~240 MB  |
| CSV → JSON (2.8 GB)  | 1 min 41 s | ~240 MB (JS heap capped at 48 MB) |
| JSON → CSV           | 56 s  | ~200 MB (JS heap capped at 48 MB) |

The conversions run with the JS heap capped at 48 MB, so memory doesn't grow with the file size. Most of the RSS is
Node.js itself and the stream buffers, not the data.
Times depend a lot on the disk. The JSON → CSV round trip gives a byte-identical copy of the original CSV.

## Error handling

| Situation                                   | Example message                                                          | Exit code |
|---------------------------------------------|--------------------------------------------------------------------------|-----------|
| missing / unknown option                    | `error: required option '-r, --resultFile <path>' not specified` + usage | 1         |
| invalid separator or size                   | `error: option '-d, --separator <char>' argument ',,' is invalid. ...`  | 1         |
| source missing / not a file / not readable  | `Error: Source file not found: "x.csv"`                                  | 2         |
| result directory missing                    | `Error: Result directory does not exist: "..."`                          | 2         |
| result is a directory or the same as source | `Error: Source and result files must be different`                       | 2         |
| wrong number of columns                     | `Error: Invalid CSV at line 2: expected 3 columns, got 4`                | 1         |
| unclosed quote                              | `Error: Invalid CSV at line 2: Unclosed quoted field (missing closing quote)` | 1    |
| quote inside an unquoted field              | `Error: Invalid CSV at line 2: Unexpected quote inside an unquoted field ...` | 1    |
| empty file                                  | `Error: Invalid CSV: file is empty, a header row is required`            | 1         |
| empty / duplicate column name               | `Error: Invalid CSV at line 1: duplicate column name "a" in the header`  | 1         |
| malformed JSON, not an array of objects     | `Error: Invalid JSON in array element #2: Unexpected number in JSON ...` | 1         |
| disk errors while reading or writing        | `Error: File system error "...": no space left on device (ENOSPC)`       | 1         |
| Drive not configured, token expired, quota  | `Error: Google Drive is not configured: set GOOGLE_CLIENT_ID ...`        | 1         |
| Ctrl+C                                      | `Error: Interrupted by user`, partial file removed                       | 2         |

Exit code 2 means a usage problem (bad paths, interrupted run). Exit code 1 means invalid arguments, invalid data, or an
I/O or Drive failure. After any failure the `<result>.part` file is removed and an existing result file is left untouched.

Set `DEBUG=1` to also print stack traces, and `NO_PROGRESS=1` to turn off the progress output.

## How it works

```
fs.createReadStream ──► progress (Transform) ──► CsvToJsonTransform ──► fs.createWriteStream(result.part)
     1 MB chunks            counts bytes         or JsonToCsvTransform       rename to result on success
```

Both converters use the same pipeline (`src/application/workflows/conversion.workflow.js`); only the transform differs.

- `stream.pipeline()` connects the streams, passes errors through, and handles **backpressure**. When the write stream
  is busy, `_transform` isn't called again, so reading pauses.
- `CsvRowParser` (`src/core/parsers/csv.parser.js`) is a state machine (`FIELD_START`, `UNQUOTED`, `QUOTED`,
  `QUOTE_IN_QUOTED`, `AFTER_QUOTED`). It keeps only the unfinished field and row between chunks, so a record can be
  split across any number of chunks.
- `StringDecoder` makes sure a multi-byte UTF-8 character split across two chunks is decoded correctly.
- `JsonToCsvTransform` doesn't parse the whole JSON at once. `JsonArrayParser` (`src/core/parsers/json-array.parser.js`)
  tracks brackets and strings to find where each top-level array element ends, and only that element is passed to `JSON.parse`.
- `CsvToJsonTransform` collects the JSON pieces of a chunk in an array and joins them once, which is about twice as fast
  as growing a string with `+=`.
- The upload reads the result file as a stream too (optionally through `zlib.createGzip()`), cuts it into 8 MB chunks
  and sends them with the resumable upload protocol. After a network error or a 5xx response it asks Drive how many bytes
  arrived and continues from there.
- The generator wraps an async generator in `Readable.from()`, so new rows are produced only when the file stream wants more.

## Architecture

The code follows a **layered architecture**. Each layer has one responsibility and only imports from the layers below it:

```
cli  ──►  application  ──►  core
                │
                └──────►  infrastructure          (utils and config can be used by every layer)
```

| Layer              | Responsibility                                                              | Knows about                         |
|--------------------|-----------------------------------------------------------------------------|-------------------------------------|
| **cli**            | parse arguments, print messages and progress, map errors to exit codes      | application                         |
| **application**    | use cases: validate input, choose the delimiter, run the conversion workflow | core, infrastructure                |
| **core**           | pure logic: parsers, Transform streams, formatter, validator, delimiter detection | nothing (no fs, network or console) |
| **infrastructure** | file system and Google Drive                                                | the outside world                   |
| **utils / config** | errors, logger and progress, formatting, `.env` loading                   | used by every layer                 |

Because `core` has no I/O, the parsers and streams don't depend on where the data comes from. For example, the
generator reuses the same CSV parser to read the mock file. Lower layers never print
anything: they report events (detected delimiter, skipped rows) through callbacks, and the `cli` layer decides what to show.

What happens when you run `node csvToJson.js -s source.csv -r result.json`:

1. `csvToJson.js` calls `runCommand()` with the command from `src/cli/commands/convert-to-json.js`. Commander parses the arguments.
2. The command calls `convertCsvToJson()` in `src/application/services/csv-to-json.service.js`.
3. The service validates the paths (`infrastructure/filesystem`) and, if no `--separator` was given, reads the first
   64 KB of the file and passes it to `detectDelimiter()` (`core/detectors`).
4. `conversion.workflow.js` builds the stream pipeline: file reader → progress → `CsvToJsonTransform` (`core/streams`)
   → `<result>.part`, then renames the file.
5. The command prints the summary and calls `uploadFile()` (`application/services/upload.service.js`), which loads the
   Google Drive modules only at this point.
6. Any error goes back up to `runMain()` in `src/cli/index.js`, which prints a readable message and sets the exit code.

### Project structure

```
nodejs-practice/
│
├── csvToJson.js                        entry point: CSV → JSON (`node csvToJson.js ...`, as in the task)
├── jsonToCsv.js                        entry point: JSON → CSV
│
├── src/
│   │
│   ├── cli/                            presentation layer
│   │   ├── index.js                    runCommand() / runMain(): error → message + exit code
│   │   ├── options.js                  --separator and --size argument parsers
│   │   ├── output.js                   summaries, skipped-row warnings, upload result
│   │   └── commands/
│   │       ├── convert-to-json.js      csv-to-json command (options + action)
│   │       └── convert-to-csv.js       json-to-csv command
│   │
│   ├── application/                    application layer (use cases)
│   │   ├── services/
│   │   │   ├── csv-to-json.service.js  validate paths → detect delimiter → convert
│   │   │   ├── json-to-csv.service.js  validate paths → convert
│   │   │   ├── generate-csv.service.js read the mock → stream generated rows to a file
│   │   │   ├── delimiter.service.js    delimiter detection from the first 64 KB of a file
│   │   │   └── upload.service.js       Drive upload and authorization (lazy-loads googleapis)
│   │   └── workflows/
│   │       └── conversion.workflow.js  read → progress → transform → <result>.part → rename
│   │
│   ├── core/                           domain logic (no file system, network or console)
│   │   ├── streams/
│   │   │   ├── csv-to-json.stream.js   CsvToJsonTransform
│   │   │   ├── json-to-csv.stream.js   JsonToCsvTransform
│   │   │   └── csv-generator.stream.js Readable stream that repeats the mock rows
│   │   ├── parsers/
│   │   │   ├── csv.parser.js           CsvRowParser: incremental RFC 4180 state machine
│   │   │   └── json-array.parser.js    JsonArrayParser: finds and parses one array element at a time
│   │   ├── formatters/
│   │   │   └── csv.formatter.js        CSV serialization (quoting)
│   │   ├── validators/
│   │   │   └── csv.validator.js        header and column-count checks
│   │   └── detectors/
│   │       └── delimiter.detector.js   delimiter detection from a text sample
│   │
│   ├── infrastructure/                 infrastructure layer (outside world)
│   │   ├── filesystem/
│   │   │   ├── file-reader.js          source checks, read streams, reading the file head
│   │   │   ├── file-writer.js          target checks, write streams, .part → result rename
│   │   │   └── paths.js                validatePaths(): source + result checks together
│   │   └── google-drive/
│   │       ├── drive.client.js         OAuth2 client, folder lookup, quota check (googleapis)
│   │       ├── drive-uploader.js       resumable upload over fetch, 8 MB chunks, retries
│   │       └── drive-auth.js           local-server OAuth flow
│   │
│   ├── utils/
│   │   ├── errors.js                   AppError and subclasses, describeError()
│   │   ├── logger.js                   console logger, progress printer and progress stream
│   │   └── format.js                   byte and duration formatting
│   │
│   └── config/
│       └── index.js                    .env loading, Drive settings
│
├── scripts/
│   ├── generate-mock-csv.js            large CSV generator (`npm run generate:10gb`)
│   └── google-auth.js                  one-time OAuth authorization (`npm run auth`)
│
├── data/
│   ├── mock.csv                        mock data for the generator
│   └── sample*.csv                     small samples with `,`, `;` and space delimiters
│
├── .env.example                        template for Google credentials
├── .gitignore
├── package.json
└── README.md
```
