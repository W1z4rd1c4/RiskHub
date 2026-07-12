import { describe, expect, it } from 'vitest';

import {
  fingerprint,
  ratchetAgainstBaseRef,
  validateDeviations,
  // eslint-disable-next-line import/extensions -- pure ESM sibling of the CLI script
} from '../../../../../frontend/scripts/a11y/jsx-a11y-ratchet.mjs';

/**
 * Commit 5b · Deliverables 2 & 3 — jsx-a11y base-ref ratchet + deviation registry.
 *
 * The ratchet keys on per-(file, rule) COUNTS, not line/column, so benign line
 * shifts pass while genuine widening (a count increase or a new (file,rule) pair)
 * fails. The deviation validator enforces a 1:1 baseline<->deviation mapping and
 * stays DORMANT until the deviations file exists. All fixtures are in-memory — the
 * real 221-entry baseline is never touched.
 */

type Entry = { rule: string; file: string; line: number; column: number };

function entry(rule: string, file: string, line: number, column = 1): Entry {
  return { rule, file, line, column };
}

const ALT = 'jsx-a11y/alt-text';
const LABEL = 'jsx-a11y/label-has-associated-control';
const FOO = 'src/components/Foo.tsx';
const BAR = 'src/pages/Bar.tsx';

describe('ratchetAgainstBaseRef — per-(file,rule) count ratchet', () => {
  it('(a) identical counts pass', () => {
    const base = [entry(ALT, FOO, 12), entry(ALT, FOO, 40), entry(LABEL, BAR, 7)];
    const committed = [entry(ALT, FOO, 12), entry(ALT, FOO, 40), entry(LABEL, BAR, 7)];
    const result = ratchetAgainstBaseRef(committed, base);
    expect(result.skipped).toBe(false);
    expect(result.widened).toEqual([]);
  });

  it('tolerates a benign line shift (same file+rule+count, different line/column)', () => {
    const base = [entry(ALT, FOO, 241)];
    const committed = [entry(ALT, FOO, 280, 9)]; // moved 241 -> 280, same (file,rule) count
    expect(ratchetAgainstBaseRef(committed, base).widened).toEqual([]);
  });

  it('(b) a strict count decrease passes', () => {
    const base = [entry(ALT, FOO, 12), entry(ALT, FOO, 40)];
    const committed = [entry(ALT, FOO, 12)]; // 2 -> 1 for (FOO, ALT)
    expect(ratchetAgainstBaseRef(committed, base).widened).toEqual([]);
  });

  it('(b) a removed (file,rule) pair passes', () => {
    const base = [entry(ALT, FOO, 12), entry(LABEL, BAR, 7)];
    const committed = [entry(ALT, FOO, 12)]; // (BAR, LABEL) removed entirely
    expect(ratchetAgainstBaseRef(committed, base).widened).toEqual([]);
  });

  it('(c) a count increase fails', () => {
    const base = [entry(ALT, FOO, 12)];
    const committed = [entry(ALT, FOO, 12), entry(ALT, FOO, 40)]; // 1 -> 2 for (FOO, ALT)
    const result = ratchetAgainstBaseRef(committed, base);
    expect(result.skipped).toBe(false);
    expect(result.widened).toEqual([
      { file: FOO, rule: ALT, committedCount: 2, baseCount: 1, kind: 'count-increase' },
    ]);
  });

  it('(d) a new (file,rule) pair fails', () => {
    const base = [entry(ALT, FOO, 12)];
    const committed = [entry(ALT, FOO, 12), entry(LABEL, BAR, 7)]; // (BAR, LABEL) is brand new
    const result = ratchetAgainstBaseRef(committed, base);
    expect(result.widened).toEqual([
      { file: BAR, rule: LABEL, committedCount: 1, baseCount: 0, kind: 'new-pair' },
    ]);
  });

  it('(e) a null base-ref skips gracefully (first-introduction)', () => {
    const committed = [entry(ALT, FOO, 12), entry(LABEL, BAR, 7)];
    const result = ratchetAgainstBaseRef(committed, null);
    expect(result.skipped).toBe(true);
    expect(result.widened).toEqual([]);
    expect(result.reason).toBe('base-ref-absent');
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
