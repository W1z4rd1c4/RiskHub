import { describe, expect, it } from 'vitest';

// The flat ESM config (default export = the resolved config array, plus the pure
// severity-promotion helper as a named export). It carries no type declarations;
// this test only inspects the RESOLVED runtime rule severities and the helper.
// eslint-disable-next-line import/extensions -- flat ESM config sibling of the app
import eslintConfig, { promoteJsxA11yWarnToError } from '../../../../../frontend/eslint.config.js';

/**
 * Commit R1 — config-normalization guard for the jsx-a11y severity map.
 *
 * `eslint.config.js` derives the app's jsx-a11y rule block from
 * `jsxA11y.flatConfigs.recommended.rules`. The correct policy is to PRESERVE each
 * rule's shipped severity and upgrade ONLY `warn` -> `error`. A prior version
 * force-promoted EVERY entry to `error`, which manufactured violations for the two
 * rules the plugin ships as `off`:
 *   - `jsx-a11y/label-has-for` (deprecated; shipped `off`)
 *   - `jsx-a11y/control-has-associated-label` (shipped `off`, with an options tuple)
 * The modern labeling rule `jsx-a11y/label-has-associated-control` ships `error`, so
 * dropping those two loses no real labeling coverage.
 */

type FlatConfigBlock = {
  rules?: Record<string, unknown>;
  linterOptions?: { noInlineConfig?: boolean };
};

/** The single flat-config block that carries the jsx-a11y rule severities. */
function jsxA11yRuleBlock(config: unknown): Record<string, unknown> {
  const blocks = config as FlatConfigBlock[];
  const block = blocks.find(
    (b) => b?.rules && Object.keys(b.rules).some((k) => k.startsWith('jsx-a11y/')),
  );
  if (!block?.rules) throw new Error('no jsx-a11y rule block found in eslint.config.js');
  return block.rules;
}

/** Normalize an ESLint rule entry to its severity token (`"off" | "warn" | "error"` or 0/1/2). */
function severityOf(entry: unknown): unknown {
  return Array.isArray(entry) ? entry[0] : entry;
}

describe('eslint.config.js — resolved jsx-a11y rule severities', () => {
  const rules = jsxA11yRuleBlock(eslintConfig);

  it('enforces every enabled recommended rule as an error', () => {
    for (const entry of Object.values(rules)) {
      expect(['off', 'error']).toContain(severityOf(entry));
    }
  });

  it('forbids inline ESLint configuration so source cannot suppress the zero policy', () => {
    const blocks = eslintConfig as FlatConfigBlock[];
    expect(blocks.some((block) => block.linterOptions?.noInlineConfig === true)).toBe(true);
  });

  it('leaves the deprecated, plugin-`off` label-has-for as off (not force-promoted to error)', () => {
    expect(severityOf(rules['jsx-a11y/label-has-for'])).toBe('off');
  });

  it('leaves the plugin-`off` control-has-associated-label as off, preserving its options tuple', () => {
    const entry = rules['jsx-a11y/control-has-associated-label'];
    expect(Array.isArray(entry)).toBe(true); // shipped as ["off", { ...options }]
    expect(severityOf(entry)).toBe('off');
    expect((entry as unknown[])[1]).toMatchObject({ ignoreElements: expect.any(Array) });
  });

  it('keeps the modern labeling rule label-has-associated-control at its shipped error', () => {
    expect(severityOf(rules['jsx-a11y/label-has-associated-control'])).toBe('error');
  });

  it('keeps a recommended-`error` rule (alt-text) at error', () => {
    expect(severityOf(rules['jsx-a11y/alt-text'])).toBe('error');
  });
});

describe('promoteJsxA11yWarnToError — severity-preservation policy', () => {
  it('upgrades a `warn` rule to `error`', () => {
    expect(promoteJsxA11yWarnToError('warn')).toBe('error');
    expect(promoteJsxA11yWarnToError(1)).toBe('error');
  });

  it('upgrades a `warn` tuple to `error`, preserving its options', () => {
    expect(promoteJsxA11yWarnToError(['warn', { some: 'option' }])).toEqual([
      'error',
      { some: 'option' },
    ]);
  });

  it('leaves an `off` rule off (string and options-tuple forms)', () => {
    expect(promoteJsxA11yWarnToError('off')).toBe('off');
    expect(promoteJsxA11yWarnToError(['off', { ignoreElements: ['input'] }])).toEqual([
      'off',
      { ignoreElements: ['input'] },
    ]);
  });

  it('leaves an `error` rule at error, preserving its options', () => {
    expect(promoteJsxA11yWarnToError('error')).toBe('error');
    expect(promoteJsxA11yWarnToError(['error', { depth: 25 }])).toEqual(['error', { depth: 25 }]);
  });
});
