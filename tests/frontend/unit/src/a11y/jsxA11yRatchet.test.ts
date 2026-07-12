import { describe, expect, it } from 'vitest';

import {
  fingerprint,
  ratchetAgainstBaseRef,
  validateDeviations,
  // eslint-disable-next-line import/extensions -- pure ESM sibling of the CLI script
} from '../../../../../frontend/scripts/a11y/jsx-a11y-ratchet.mjs';

/**
 * Commit R2 · exact-fingerprint, fail-closed jsx-a11y base-ref ratchet.
 *
 * The ratchet keys on the EXACT per-entry fingerprint (rule|file|line|column) and
 * enforces a SUBSET: every committed baseline fingerprint MUST be present in the
 * base-ref baseline, else it is WIDENING and FAILS. A benign line shift
 * (241 -> 280) — same (file,rule) count but a new location — is therefore widening
 * now and FAILS; an unresolvable/absent base-ref FAILS (never skips), so the
 * 0-entry baseline can never be silently re-widened. The deviation validator
 * (unchanged) enforces a 1:1 baseline<->deviation mapping and stays DORMANT until
 * the file exists. All fixtures are in-memory — the live baseline is never touched.
 */

type Entry = { rule: string; file: string; line: number; column: number };

function entry(rule: string, file: string, line: number, column = 1): Entry {
  return { rule, file, line, column };
}

const ALT = 'jsx-a11y/alt-text';
const LABEL = 'jsx-a11y/label-has-associated-control';
const FOO = 'src/components/Foo.tsx';
const BAR = 'src/pages/Bar.tsx';

describe('ratchetAgainstBaseRef — exact-fingerprint subset ratchet (fail-closed)', () => {
  it('(c) an identical fingerprint set passes', () => {
    const base = [entry(ALT, FOO, 12), entry(ALT, FOO, 40), entry(LABEL, BAR, 7)];
    const committed = [entry(ALT, FOO, 12), entry(ALT, FOO, 40), entry(LABEL, BAR, 7)];
    const result = ratchetAgainstBaseRef(committed, base);
    expect(result.resolved).toBe(true);
    expect(result.widened).toEqual([]);
  });

  it('(a) a same-(file,rule)-count but different-location fingerprint (241 -> 280) now FAILS', () => {
    const base = [entry(ALT, FOO, 241)];
    const committed = [entry(ALT, FOO, 280, 9)]; // same (file,rule) count, moved location
    const result = ratchetAgainstBaseRef(committed, base);
    expect(result.resolved).toBe(true);
    expect(result.widened.map((w) => w.fingerprint)).toEqual([fingerprint(entry(ALT, FOO, 280, 9))]);
  });

  it('(d) a strict subset (a fingerprint removed) passes', () => {
    const base = [entry(ALT, FOO, 12), entry(ALT, FOO, 40)];
    const committed = [entry(ALT, FOO, 12)]; // FOO|ALT|40 removed
    const result = ratchetAgainstBaseRef(committed, base);
    expect(result.resolved).toBe(true);
    expect(result.widened).toEqual([]);
  });

  it('(d) a removed (file,rule) pair passes', () => {
    const base = [entry(ALT, FOO, 12), entry(LABEL, BAR, 7)];
    const committed = [entry(ALT, FOO, 12)]; // (BAR, LABEL) removed entirely
    expect(ratchetAgainstBaseRef(committed, base).widened).toEqual([]);
  });

  it('a brand-new fingerprint (same (file,rule), count +1) FAILS as widening', () => {
    const base = [entry(ALT, FOO, 12)];
    const committed = [entry(ALT, FOO, 12), entry(ALT, FOO, 40)]; // FOO|ALT|40 not in base
    const result = ratchetAgainstBaseRef(committed, base);
    expect(result.widened.map((w) => w.fingerprint)).toEqual([fingerprint(entry(ALT, FOO, 40))]);
  });

  it('a brand-new (file,rule) pair FAILS as widening', () => {
    const base = [entry(ALT, FOO, 12)];
    const committed = [entry(ALT, FOO, 12), entry(LABEL, BAR, 7)]; // (BAR, LABEL) is brand new
    const result = ratchetAgainstBaseRef(committed, base);
    expect(result.widened.map((w) => w.fingerprint)).toEqual([fingerprint(entry(LABEL, BAR, 7))]);
  });

  it('(b) an unresolvable/absent base-ref FAILS (not skipped)', () => {
    const committed = [entry(ALT, FOO, 12), entry(LABEL, BAR, 7)];
    const result = ratchetAgainstBaseRef(committed, null);
    expect(result.resolved).toBe(false);
    expect(result.reason).toBe('base-ref-unresolved');
    expect(result.widened).toEqual([]);
  });
});

describe('validateDeviations — 1:1 baseline<->deviation registry (dormant until file exists)', () => {
  const baseline = [entry(ALT, FOO, 12), entry(LABEL, BAR, 7)];
  const devFor = (e: Entry, justification = 'tracked') => ({ fingerprint: fingerprint(e), justification });

  it('full match passes', () => {
    const deviations = [devFor(baseline[0]), devFor(baseline[1])];
    const result = validateDeviations(baseline, deviations);
    expect(result.dormant).toBe(false);
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.stale).toEqual([]);
  });

  it('matches deviation records that carry rule/file/line/column instead of an explicit fingerprint', () => {
    const deviations = [{ ...baseline[0] }, { ...baseline[1] }]; // derived fingerprint path
    expect(validateDeviations(baseline, deviations).ok).toBe(true);
  });

  it('a baseline entry with no deviation record fails', () => {
    const deviations = [devFor(baseline[0])]; // baseline[1] uncovered
    const result = validateDeviations(baseline, deviations);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([baseline[1]]);
  });

  it('a stale deviation record (no matching entry) fails', () => {
    const stale = devFor(entry(ALT, 'src/pages/Gone.tsx', 99));
    const deviations = [devFor(baseline[0]), devFor(baseline[1]), stale];
    const result = validateDeviations(baseline, deviations);
    expect(result.ok).toBe(false);
    expect(result.stale).toEqual([stale]);
  });

  it('a duplicate deviation for one fingerprint fails (must be exactly one)', () => {
    const deviations = [devFor(baseline[0]), devFor(baseline[0]), devFor(baseline[1])];
    const result = validateDeviations(baseline, deviations);
    expect(result.ok).toBe(false);
    expect(result.duplicates).toEqual([fingerprint(baseline[0])]);
  });

  it('an absent deviations file (null) is dormant and passes', () => {
    const result = validateDeviations(baseline, null);
    expect(result.dormant).toBe(true);
    expect(result.ok).toBe(true);
  });
});
