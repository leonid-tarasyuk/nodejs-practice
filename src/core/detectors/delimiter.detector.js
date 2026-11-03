/** Candidates in order of preference (used to break ties). */
export const DELIMITER_CANDIDATES = [',', ';', '\t', '|', ' '];

/** How much of the file the detector needs to look at. */
export const DELIMITER_SAMPLE_BYTES = 64 * 1024;

const SAMPLE_RECORDS = 20;

/**
 * Picks the candidate that appears the same (non-zero) number of times in every
 * sampled record, outside of quoted values. When several candidates are consistent,
 * the one with the most occurrences wins; space is only used as a last resort.
 *
 * @param {string} sample beginning of the CSV text
 * @param {boolean} isComplete true if the sample is the whole file (last record is not cut)
 */
export function detectDelimiter(sample, isComplete = true) {
  const records = countPerRecord(sample.replace(/^﻿/, ''), isComplete);
  if (records.length === 0) return DELIMITER_CANDIDATES[0];

  let best = null;
  for (const candidate of DELIMITER_CANDIDATES) {
    const counts = records.map((r) => r.get(candidate) ?? 0);
    const consistent = counts[0] > 0 && counts.every((c) => c === counts[0]);
    if (!consistent) continue;
    const score = counts[0];
    const isSpace = candidate === ' ';
    if (!best || (best.isSpace && !isSpace) || (best.isSpace === isSpace && score > best.score)) {
      best = { candidate, score, isSpace };
    }
  }
  if (best) return best.candidate;

  // Nothing is consistent (e.g. broken rows): use the most frequent candidate of the header row.
  const header = records[0];
  let fallback = DELIMITER_CANDIDATES[0];
  let max = 0;
  for (const candidate of DELIMITER_CANDIDATES) {
    const count = header.get(candidate) ?? 0;
    if (count > max && candidate !== ' ') {
      max = count;
      fallback = candidate;
    }
  }
  return fallback;
}

/** Splits the sample into records (quote-aware) and counts candidate characters in each. */
function countPerRecord(text, isComplete) {
  const records = [];
  let counts = new Map();
  let inQuotes = false;
  let nonEmpty = false;

  for (let i = 0; i < text.length && records.length < SAMPLE_RECORDS; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes; // an escaped "" toggles twice, which is fine
      nonEmpty = true;
    } else if (inQuotes) {
      continue;
    } else if (ch === '\n' || ch === '\r') {
      if (nonEmpty) records.push(counts);
      counts = new Map();
      nonEmpty = false;
    } else {
      nonEmpty = true;
      if (DELIMITER_CANDIDATES.includes(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
  }
  // The last record is only reliable if the sample contains the whole file.
  if (nonEmpty && isComplete && records.length < SAMPLE_RECORDS) records.push(counts);
  return records;
}
