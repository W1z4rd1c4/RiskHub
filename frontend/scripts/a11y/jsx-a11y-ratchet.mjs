/**
 * Pure, side-effect-free ratchet + deviation logic for the jsx-a11y baseline
 * (ADR-013 · FR-P1-4). Extracted from `jsx-a11y-baseline.mjs` so it can be unit
 * tested with in-memory fixtures WITHOUT importing ESLint, touching the filesystem,
 * shelling out to git, or running the CLI. The CLI (`jsx-a11y-baseline.mjs`) owns
 * every impure edge (ESLint, fs, `git show`) and delegates the decisions here.
 */

/** Fingerprint one finding/baseline entry by rule + file + exact location (N5). */
export function fingerprint(entry) {
  return `${entry.rule}|${entry.file}|${entry.line}|${entry.column}`;
}

/**
 * Parse baseline JSON text into its `entries` array. Returns `[]` for a
 * well-formed file that carries no entries; THROWS on malformed JSON so callers
 * can decide whether a parse failure is fatal (working-tree read) or a graceful
 * skip (base-ref read).
 */
export function parseBaselineJson(text) {
  const parsed = JSON.parse(text);
  return Array.isArray(parsed?.entries) ? parsed.entries : [];
}

// A `(file, rule)` key that never collides: a file path and a `jsx-a11y/*` rule id
// each contain no whitespace, so joining them with a single space is unambiguous.
function fileRuleKey(entry) {
  return `${entry.file} ${entry.rule}`;
}

/**
 * Count baseline entries per `(file, rule)` pair (NOT per line/column). Each value
 * carries the structured `{ file, rule, count }` so callers never re-split the key.
 * @returns {Map<string, {file: string, rule: string, count: number}>}
 */
export function countByFileRule(entries) {
  const counts = new Map();
  for (const entry of entries) {
    const key = fileRuleKey(entry);
    const bucket = counts.get(key) ?? { file: entry.file, rule: entry.rule, count: 0 };
    bucket.count += 1;
    counts.set(key, bucket);
  }
  return counts;
}

/**
 * Base-ref ratchet: the committed baseline may not WIDEN relative to the base-ref
 * baseline. Keyed on per-`(file, rule)` COUNTS — NOT on line/column — so a
 * violation shifting line 241 -> 280 (same file+rule, same count) passes, while a
 * genuinely new violation (count increase) or a brand-new `(file, rule)` pair
 * fails. A strict decrease or a removed `(file, rule)` pair is always allowed.
 *
 * `baseRefEntries === null` signals "base-ref has no baseline file" (introduced on
 * this branch, absent on the base ref); the ratchet then SKIPS gracefully. See the
 * CLI for the pre-first-merge limitation this encodes.
 *
 * @returns {{ skipped: boolean, widened: Array<{file: string, rule: string, committedCount: number, baseCount: number, kind: 'new-pair' | 'count-increase'}>, reason: string | null }}
 */
export function ratchetAgainstBaseRef(committedEntries, baseRefEntries) {
  if (baseRefEntries === null || baseRefEntries === undefined) {
    return { skipped: true, widened: [], reason: 'base-ref-absent' };
  }
  const baseCounts = countByFileRule(baseRefEntries);
  const committedCounts = countByFileRule(committedEntries);
  const widened = [];
  for (const { file, rule, count } of committedCounts.values()) {
    const baseCount = baseCounts.get(fileRuleKey({ file, rule }))?.count ?? 0;
    if (count > baseCount) {
      widened.push({
        file,
        rule,
        committedCount: count,
        baseCount,
        kind: baseCount === 0 ? 'new-pair' : 'count-increase',
      });
    }
  }
  return { skipped: false, widened, reason: null };
}

/** Fingerprint a deviation record: prefer its explicit `fingerprint`, else derive it. */
export function deviationFingerprint(record) {
  if (typeof record.fingerprint === 'string' && record.fingerprint.length > 0) {
    return record.fingerprint;
  }
  return fingerprint(record);
}

/**
 * Deviation-registry validator (DORMANT until the deviations file exists — created
 * later by C5a). Enforces a 1:1 mapping between remaining baseline entries and
 * deviation records, keyed by the same fingerprint:
 *   - every baseline entry MUST have exactly one deviation record (missing -> fail);
 *   - every deviation record MUST match a current baseline entry (stale -> fail);
 *   - a fingerprint may not carry more than one deviation record (duplicate -> fail).
 *
 * `deviations === null` signals "no deviations file on disk" -> dormant (skip).
 *
 * @returns {{ dormant: boolean, ok: boolean, missing: Array, stale: Array, duplicates: string[] }}
 */
export function validateDeviations(baselineEntries, deviations) {
  if (deviations === null || deviations === undefined) {
    return { dormant: true, ok: true, missing: [], stale: [], duplicates: [] };
  }
  const baselineFingerprints = new Set(baselineEntries.map(fingerprint));
  const deviationCounts = new Map();
  for (const record of deviations) {
    const fp = deviationFingerprint(record);
    deviationCounts.set(fp, (deviationCounts.get(fp) ?? 0) + 1);
  }
  const missing = baselineEntries.filter((entry) => !deviationCounts.has(fingerprint(entry)));
  const stale = deviations.filter((record) => !baselineFingerprints.has(deviationFingerprint(record)));
  const duplicates = [...deviationCounts.entries()].filter(([, count]) => count > 1).map(([fp]) => fp);
  const ok = missing.length === 0 && stale.length === 0 && duplicates.length === 0;
  return { dormant: false, ok, missing, stale, duplicates };
}
