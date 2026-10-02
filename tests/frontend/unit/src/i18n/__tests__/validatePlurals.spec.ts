import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  compileInvariantPatterns,
  findPluralViolations,
  main,
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

  describe('zero tolerance (no baseline)', () => {
    const roots: string[] = [];

    function fixtureRoot(cs: object, en: object): string {
      const root = mkdtempSync(join(tmpdir(), 'plurals-'));
      roots.push(root);
      for (const [locale, content] of [['cs', cs], ['en', en]] as const) {
        const dir = join(root, 'src', 'i18n', 'locales', locale);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'common.json'), JSON.stringify(content));
      }
      return root;
    }

    afterEach(() => {
      vi.restoreAllMocks();
      for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
    });

    it('fails on any {{count}} string without plural forms', () => {
      const root = fixtureRoot({ items: '{{count}} položek' }, { items: '{{count}} items' });
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      expect(main([`--root=${root}`])).toBe(1);
      expect(error).toHaveBeenCalledWith(expect.stringContaining('[cs] common:items is missing _one, _few, _other'));
      expect(error).toHaveBeenCalledWith(expect.stringContaining('[en] common:items is missing _one, _other'));
    });

    it('passes once every {{count}} string is a plural family', () => {
      const root = fixtureRoot(
        { items_one: '{{count}} položka', items_few: '{{count}} položky', items_many: '{{count}} položky', items_other: '{{count}} položek' },
        { items_one: '{{count}} item', items_few: '{{count}} items', items_many: '{{count}} items', items_other: '{{count}} items' },
      );
      vi.spyOn(console, 'log').mockImplementation(() => undefined);

      expect(main([`--root=${root}`])).toBe(0);
    });
  });
});
