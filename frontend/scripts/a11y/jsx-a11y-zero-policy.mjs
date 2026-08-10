/**
 * Pure validation seam for the strict-zero jsx-a11y policy.
 *
 * The JSON files are audit evidence, not an exception mechanism. Both must be
 * well-formed and empty; every enabled jsx-a11y finding is a gate failure.
 */

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseEmptyBaseline(source) {
  const parsed = JSON.parse(source);
  if (!isPlainObject(parsed)) throw new Error('jsx-a11y baseline must be a JSON object');
  if (!Array.isArray(parsed.entries)) throw new Error('jsx-a11y baseline entries must be an array');
  if (parsed.count !== 0) throw new Error('jsx-a11y baseline count must be exactly zero');
  if (parsed.entries.length !== 0) throw new Error('jsx-a11y baseline must contain zero entries');
  return parsed.entries;
}

export function parseEmptySuppressions(source) {
  const parsed = JSON.parse(source);
  if (!isPlainObject(parsed)) throw new Error('ESLint suppressions must be a JSON object');
  if (Object.keys(parsed).length !== 0) throw new Error('ESLint suppressions must contain zero entries');
  return parsed;
}

export function evaluateZeroPolicy({ findings, baselineEntries, suppressions }) {
  const failures = [];
  if (findings.length > 0) failures.push(`${findings.length} enabled jsx-a11y finding(s)`);
  if (baselineEntries.length > 0) failures.push(`${baselineEntries.length} baseline exception(s)`);
  if (Object.keys(suppressions).length > 0) failures.push('ESLint suppression entries are forbidden');
  return failures;
}
