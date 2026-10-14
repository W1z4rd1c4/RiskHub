import type PostCss from 'postcss';
import type * as FontAssets from '../../../../../frontend/scripts/quality/validate-font-assets.mjs';
// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../frontend');
const require = createRequire(resolve(frontendRoot, 'package.json'));
const postcss = require('postcss') as typeof PostCss;
const tailwind = require('@tailwindcss/postcss') as () => PostCss.Plugin;
const { validateFontAssets } = require(resolve(frontendRoot, 'scripts/quality/validate-font-assets.mjs')) as typeof FontAssets;
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
  postcss.parse(css).walkRules((rule) => {
    if (rule.selector === selector) {
      for (const node of rule.nodes) {
        if (node.type === 'decl' && node.prop && node.value) output[node.prop] = node.value;
      }
    }
  });
  return output;
}

describe('Tailwind 4 security migration compatibility', () => {
  it('requires emitted, byte-identical fonts referenced by the production CSS', () => {
    const fixture = mkdtempSync(resolve(tmpdir(), 'riskhub-font-assets-'));
    const source = 'src/assets/fonts/files/inter-latin-wght-normal.woff2';
    const emitted = 'assets/inter-latin-wght-normal-fixture.woff2';
    try {
      mkdirSync(resolve(fixture, 'src/assets/fonts/files'), { recursive: true });
      mkdirSync(resolve(fixture, 'dist/assets'), { recursive: true });
      mkdirSync(resolve(fixture, 'dist/.vite'), { recursive: true });
      writeFileSync(resolve(fixture, source), 'wOF2fixture');
      writeFileSync(resolve(fixture, 'dist', emitted), 'wOF2fixture');
      writeFileSync(resolve(fixture, 'dist/.vite/manifest.json'), JSON.stringify({
        [source]: { file: emitted },
        'index.html': { file: 'assets/main.js', css: ['assets/main.css'] },
      }));
      const cssPath = resolve(fixture, 'dist/assets/main.css');
      writeFileSync(cssPath, `@font-face{src:url(/${emitted})}`);
      expect(validateFontAssets(fixture)).toEqual([emitted]);
      writeFileSync(cssPath, '@font-face{src:url(./files/inter-latin-wght-normal.woff2)}');
      expect(() => { validateFontAssets(fixture); }).toThrow('not referenced by built CSS');
      writeFileSync(cssPath, `@font-face{src:url(/${emitted})}`);
      writeFileSync(resolve(fixture, 'dist', emitted), 'wrong bytes');
      expect(() => { validateFontAssets(fixture); }).toThrow('differs from vendored source');
      rmSync(resolve(fixture, 'dist', emitted));
      expect(() => { validateFontAssets(fixture); }).toThrow();
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

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

  it('keeps interactive hover in the glass utility layer so its specificity can win', () => {
    const layers: Record<string, string | undefined> = {};
    let hoverBackground: string | undefined;
    postcss.parse(css).walkRules((rule) => {
      const isGlass = rule.selector === '.glass';
      const isHover = rule.selector === '.interactive-card:hover'
        || (rule.selector === '&:hover' && rule.parent?.type === 'rule' && rule.parent.selector === '.interactive-card');
      if (!isGlass && !isHover) return;
      let ancestor: PostCss.AnyNode | undefined = rule.parent;
      while (ancestor && !(ancestor.type === 'atrule' && ancestor.name === 'layer')) ancestor = ancestor.parent;
      layers[isGlass ? 'glass' : 'hover'] = ancestor?.type === 'atrule' ? ancestor.params : undefined;
      if (isHover) {
        const declaration = rule.nodes.find((node): node is PostCss.Declaration => node.type === 'decl' && node.prop === 'background-color');
        hoverBackground = declaration?.value;
        expect(declaration?.important).not.toBe(true);
      }
    });
    expect(layers).toEqual({ glass: 'utilities', hover: 'utilities' });
    expect(hoverBackground).toBe('hsl(var(--glass-hover))');
    expect(declarations('.interactive-card')['transition-property']).not.toContain('all');
    expect(declarations('.glass-card')['transition-property']).toBe('none');
  });

  it('removes the unpatched braces dependency and keeps the selector parser fixed', () => {
    const lock = JSON.parse(readFileSync(resolve(frontendRoot, 'package-lock.json'), 'utf8')) as { packages: Record<string, { version: string }> };
    const entries = Object.entries(lock.packages);
    expect(entries.filter(([path]) => /(?:^|\/)node_modules\/braces$/.test(path))).toEqual([]);
    expect(lock.packages['node_modules/postcss-selector-parser'].version).toBe('7.1.6');
    expect(lock.packages['node_modules/source-map-js'].version).toBe('1.2.2');
  });
});
