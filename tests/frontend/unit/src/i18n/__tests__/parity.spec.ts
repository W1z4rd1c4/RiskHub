import { describe, expect, it } from 'vitest';
import { resources } from '@/i18n';

function flatten(obj: unknown, prefix = ''): string[] {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];

  const entries = Object.entries(obj as Record<string, unknown>);
  const out: string[] = [];

  for (const [key, value] of entries) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...flatten(value, full));
    } else {
      out.push(full);
    }
  }

  return out;
}

describe('i18n namespace parity', () => {
  it('keeps namespace file parity between en and cs', () => {
    const enNamespaces = Object.keys(resources.en);
    const csNamespaces = Object.keys(resources.cs);

    expect(new Set(enNamespaces)).toEqual(new Set(csNamespaces));
  });

  it('keeps key parity in every namespace', () => {
    const namespaces = Object.keys(resources.en) as Array<keyof typeof resources.en>;

    for (const ns of namespaces) {
      const enKeys = new Set(flatten(resources.en[ns]));
      const csKeys = new Set(flatten(resources.cs[ns]));

      expect([...enKeys].sort()).toEqual([...csKeys].sort());
    }
  });
});
