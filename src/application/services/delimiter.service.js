import { DELIMITER_SAMPLE_BYTES, detectDelimiter } from '../../core/detectors/delimiter.detector.js';
import { readFileHead } from '../../infrastructure/filesystem/file-reader.js';

/** Detects the CSV delimiter from the beginning of the file (the first 64 KB). */
export async function detectFileDelimiter(filePath) {
  const { text, isComplete } = await readFileHead(filePath, DELIMITER_SAMPLE_BYTES);
  return detectDelimiter(text, isComplete);
}
