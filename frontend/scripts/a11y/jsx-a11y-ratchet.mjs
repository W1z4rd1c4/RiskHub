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

/**
 * Base-ref ratchet: EXACT-fingerprint SUBSET, FAIL-CLOSED. Every committed baseline
 * fingerprint (`rule|file|line|column`) MUST be present in the base-ref baseline's
 * fingerprint set; any committed fingerprint ABSENT from the base ref is WIDENING
 * and fails. Because the key is the exact location (NOT a per-`(file, rule)` count),
 * a violation moving line 241 -> 280 is a NEW fingerprint and fails — the empty
 * 0-entry baseline can never be silently re-widened. Removing a fingerprint (a
 * strict subset) is always allowed.
 *
 * `baseRefEntries === null` signals the CLI could resolve NEITHER `origin/main`-with-
 * baseline NOR the committed anchor SHA; the ratchet then reports `resolved: false`
 * so the CLI FAILS (non-zero exit) — it never skips.
 *
 * @returns {{ resolved: boolean, widened: Array<{file: string, rule: string, line: number, column: number, fingerprint: string}>, reason: string | null }}
 */
export function ratchetAgainstBaseRef(committedEntries, baseRefEntries) {
  if (baseRefEntries === null || baseRefEntries === undefined) {
    return { resolved: false, widened: [], reason: 'base-ref-unresolved' };
  }
  const baseFingerprints = new Set(baseRefEntries.map(fingerprint));
  const widened = [];
  for (const entry of committedEntries) {
    const fp = fingerprint(entry);
    if (!baseFingerprints.has(fp)) {
      widened.push({ file: entry.file, rule: entry.rule, line: entry.line, column: entry.column, fingerprint: fp });
    }
  }
  return { resolved: true, widened, reason: null };
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
