import { describe, expect, it } from 'vitest';

import {
  evaluateZeroPolicy,
  parseEmptyBaseline,
  parseEmptySuppressions,
} from '../../../../../frontend/scripts/a11y/jsx-a11y-zero-policy.mjs';

const emptyBaseline = JSON.stringify({
  _comment: 'audit evidence only',
  count: 0,
  entries: [],
});

describe('jsx-a11y strict-zero evidence policy', () => {
  it('accepts a well-formed empty baseline and empty suppressions', () => {
    expect(parseEmptyBaseline(emptyBaseline)).toEqual([]);
    expect(parseEmptySuppressions('{}')).toEqual({});
    expect(evaluateZeroPolicy({ findings: [], baselineEntries: [], suppressions: {} })).toEqual([]);
  });

  it.each([
    ['malformed JSON', '{'],
    ['missing entries', JSON.stringify({ count: 0 })],
    ['non-array entries', JSON.stringify({ count: 0, entries: {} })],
    ['non-zero declared count', JSON.stringify({ count: 1, entries: [] })],
    ['a baseline exception', JSON.stringify({ count: 1, entries: [{ rule: 'jsx-a11y/alt-text' }] })],
  ])('rejects %s', (_label, source) => {
    expect(() => parseEmptyBaseline(source)).toThrow();
  });

  it.each([
    ['malformed JSON', '{'],
    ['an array', '[]'],
    ['one suppression entry', JSON.stringify({ 'src/Foo.tsx': { 'jsx-a11y/alt-text': { count: 1 } } })],
  ])('rejects %s in the ESLint suppression file', (_label, source) => {
    expect(() => parseEmptySuppressions(source)).toThrow();
  });

  it('fails for every enabled-rule finding even with empty evidence files', () => {
    const findings = [{ rule: 'jsx-a11y/alt-text', file: 'src/Foo.tsx', line: 3, column: 5 }];
    expect(evaluateZeroPolicy({ findings, baselineEntries: [], suppressions: {} }))
      .toEqual(['1 enabled jsx-a11y finding(s)']);
  });
});
