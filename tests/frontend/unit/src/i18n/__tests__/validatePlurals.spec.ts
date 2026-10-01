import { describe, expect, it } from 'vitest';

import {
  buildBaselineDocument,
  compareWithBaseline,
  compileInvariantPatterns,
  findPluralViolations,
  needsPluralForms,
} from '../../../../../../frontend/scripts/i18n/validate-plurals.mjs';

const invariantPatterns = compileInvariantPatterns({
  invariantValuePatterns: [
    { pattern: '\\{\\{count\\}\\}\\s*%', reason: 'percentage' },
    { pattern: ':\\s*\\{\\{count\\}\\}[).\\s]*$', reason: 'label: value' },
    { pattern: '\\(\\{\\{count\\}\\}\\)', reason: 'tally' },
  ],
});

describe('validate-plurals', () => {
  it('requires cs _one/_few/_other and en _one/_other for {{count}} strings', () => {
    const cs = {
      common: {
        items: '{{count}} položek',
        risks_one: '{{count}} riziko',
        risks_few: '{{count}} rizika',
        risks_other: '{{count}} rizik',
        partial_one: '{{count}} den',
        partial_other: '{{count}} dní',
      },
    };
    const en = {
      common: {
        items: '{{count}} items',
        risks_one: '{{count}} risk',
        risks_few: '{{count}} risks',
        risks_other: '{{count}} risks',
        partial_one: '{{count}} day',
        partial_other: '{{count}} days',
      },
    };

    expect(findPluralViolations('cs', cs)).toEqual([
      { id: 'common:items', missing: ['one', 'few', 'other'] },
      { id: 'common:partial', missing: ['few'] },
    ]);
    expect(findPluralViolations('en', en)).toEqual([{ id: 'common:items', missing: ['one', 'other'] }]);
  });

  it('accepts an optional cs _many form and nested keys', () => {
    const cs = {
      dashboard: {
        kri: { days_one: '{{count}} den', days_few: '{{count}} dny', days_many: '{{count}} dne', days_other: '{{count}} dní' },
      },
    };
    expect(findPluralViolations('cs', cs)).toEqual([]);
  });

  it('exempts count-free uses through the allowlist patterns and explicit keys', () => {
    expect(needsPluralForms('Aktivní filtry: {{count}}', invariantPatterns)).toBe(false);
    expect(needsPluralForms('Archivovaná rizika ({{count}})', invariantPatterns)).toBe(false);
    expect(needsPluralForms('Hotovo {{count}} %', invariantPatterns)).toBe(false);
    expect(needsPluralForms('Výsledky nejsou úplné (přeskočeno: {{count}}).', invariantPatterns)).toBe(false);
    expect(needsPluralForms('Celkem: {{count}} položek', invariantPatterns)).toBe(true);
    expect(needsPluralForms('{{count}} nepřečtených', invariantPatterns)).toBe(true);
    expect(needsPluralForms('Bez počtu', invariantPatterns)).toBe(false);
    // An exempt use does not hide a second, counted use in the same value.
    expect(needsPluralForms('Hotovo {{count}} % z {{count}} rizik', invariantPatterns)).toBe(true);
    // Spaced and formatted placeholders interpolate the same count.
    expect(needsPluralForms('{{ count }} rizik', invariantPatterns)).toBe(true);
    expect(needsPluralForms('{{count, number}} rizik', invariantPatterns)).toBe(true);
    expect(needsPluralForms('Aktivní filtry: {{ count }}', invariantPatterns)).toBe(false);

    const cs = { risks: { filters: 'Aktivní filtry: {{count}}', legacy: '{{count}} legacy' } };
    expect(findPluralViolations('cs', cs, { invariantPatterns })).toEqual([
      { id: 'risks:legacy', missing: ['one', 'few', 'other'] },
    ]);
    expect(findPluralViolations('cs', cs, { invariantPatterns, exemptKeys: new Set(['risks:legacy']) })).toEqual([]);
  });

  it('rejects allowlist patterns without a reason', () => {
    expect(() => compileInvariantPatterns({ invariantValuePatterns: [{ pattern: '%' }] })).toThrow(/reason/);
  });

  it('ratchets: new violations are reported, fixed ones can shrink the baseline', () => {
    const baseline = { cs: ['common:items', 'common:old'], en: ['common:items'] };
    const current = {
      cs: [
        { id: 'common:items', missing: ['one', 'few', 'other'] },
        { id: 'common:new', missing: ['few'] },
      ],
      en: [{ id: 'common:items', missing: ['one', 'other'] }],
    };

    const { added, fixed } = compareWithBaseline(baseline, current);
    expect(added).toEqual([{ locale: 'cs', id: 'common:new', missing: ['few'] }]);
    expect(fixed).toEqual([{ locale: 'cs', id: 'common:old' }]);

    const document = buildBaselineDocument(current);
    expect(document.totals).toEqual({ cs: 2, en: 1 });
    expect(document.violations.cs).toEqual(['common:items', 'common:new']);
  });
});
