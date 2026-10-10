// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../frontend');
const require = createRequire(resolve(frontendRoot, 'package.json'));
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
let css: string;

beforeAll(async () => {
  const source = readFileSync(resolve(frontendRoot, 'src/index.css'), 'utf8');
  const result = await postcss([tailwind()]).process(source, {
    from: resolve(frontendRoot, 'src/index.css'),
  });
  css = result.css.replaceAll("'", '"');
}, 30_000);

function declarations(selector: string): Record<string, string> {
  const output: Record<string, string> = {};
  postcss.parse(css).walkRules((rule: { selector: string; nodes: { prop?: string; value?: string }[] }) => {
    if (rule.selector === selector) {
      for (const node of rule.nodes) {
        if (node.prop && node.value) output[node.prop] = node.value;
      }
    }
  });
  return output;
}

describe('Tailwind 4 security migration compatibility', () => {
  it('preserves the small shadow, backdrop blur and ring scales', () => {
    expect(declarations('.shadow-sm')['--tw-shadow']).toContain('0 1px 2px 0');
    expect(declarations('.backdrop-blur-sm')['--tw-backdrop-blur']).toBe('blur(4px)');
    expect(declarations('.ring')['--tw-ring-shadow']).toContain('calc(3px +');
  });

  it('preserves following-visible-sibling spacing, including fractional spacing', () => {
    for (const [name, value] of [['space-y-2', '2'], ['space-y-1\\.5', '1.5']]) {
      const resetSelector = ':where([class*="space-y-"] > :not(:last-child))';
      const reset = declarations(resetSelector);
      expect(reset['margin-block-start']).toBe('0');
      expect(reset['margin-block-end']).toBe('0');
      expect(css.indexOf(resetSelector)).toBeGreaterThan(css.lastIndexOf(`:where(.${name} > :not(:last-child))`));
      const siblings = declarations(`.${name} > :not([hidden]) ~ :not([hidden])`);
      expect(siblings['margin-top']).toContain(`var(--spacing) * ${value}`);
      expect(siblings['margin-bottom']).toContain('var(--tw-space-y-reverse)');
    }
  });

  it('preserves top dividers on following visible rows', () => {
    const siblings = declarations('.divide-y > :not([hidden]) ~ :not([hidden])');
    expect(siblings['border-top-width']).toBe('1px');
    expect(siblings['border-bottom-width']).toBe('0');
    expect(siblings['border-color']).toBe('hsl(var(--border))');
  });

  it('compiles custom glass cards and accessible focus recipes', () => {
    expect(declarations('.glass-card')['background-color']).toBe('hsl(var(--glass))');
    expect(css).toContain('outline: 2px solid transparent');
    expect(css).toContain('outline-offset: 2px');
    expect(css).toContain('hsl(var(--ring))');
  });

  it('removes the unpatched braces dependency and keeps the selector parser fixed', () => {
    const lock = JSON.parse(readFileSync(resolve(frontendRoot, 'package-lock.json'), 'utf8'));
    const entries = Object.entries(lock.packages) as [string, { version?: string }][];
    expect(entries.filter(([path]) => /(?:^|\/)node_modules\/braces$/.test(path))).toEqual([]);
    expect(lock.packages['node_modules/postcss-selector-parser'].version).toBe('7.1.6');
    expect(lock.packages['node_modules/source-map-js'].version).toBe('1.2.2');
  });
});
