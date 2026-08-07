import { describe, expect, it } from 'vitest';
import { resources } from '@/i18n';

/**
 * GovernedMutationReasonDialog resolves its keys dynamically
 * (`t(`${namespace}:link_approval.${kind}.title`)`), which the static key-usage
 * validator cannot see; the `namespace` prop is required, so every call site
 * names its namespace explicitly. Guard every reachable namespace × kind
 * combination (call-site audit: `link_update` is only ever passed with
 * namespace="processes" — AssetLinkSections.tsx) in both locales.
 */

const REACHABLE: Array<[namespace: string, kinds: string[]]> = [
  ['processes', ['link_add', 'link_remove', 'link_update']],
  ['vendors', ['link_add', 'link_remove']],
  ['assets', ['link_add', 'link_remove']],
];

const LOCALES = ['en', 'cs'] as const;

function leaf(ns: Record<string, unknown>, path: string[]): unknown {
  return path.reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], ns);
}

describe('GovernedMutationReasonDialog dynamic i18n keys (all reachable namespace × kind)', () => {
  const cases = LOCALES.flatMap((locale) =>
    REACHABLE.map(([namespace, kinds]) => ({ locale, namespace, kinds })),
  );

  it.each(cases)('$locale:$namespace has every leaf the dialog reads', ({ locale, namespace, kinds }) => {
    const ns = resources[locale][namespace as keyof (typeof resources)[typeof locale]] as Record<string, unknown>;
    const paths = [
      ['link_approval', 'continue'],
      ['link_approval', 'reason_placeholder'],
      ['form', 'request_reason'],
      ...kinds.flatMap((kind) => [
        ['link_approval', kind, 'title'],
        ['link_approval', kind, 'message'],
      ]),
    ];
    for (const path of paths) {
      const value = leaf(ns, path);
      expect(value, `${locale}:${namespace}:${path.join('.')}`).toBeTypeOf('string');
      expect(value, `${locale}:${namespace}:${path.join('.')}`).not.toBe('');
    }
  });
});
