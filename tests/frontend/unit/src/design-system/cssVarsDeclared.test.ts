import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * DS-18 — every CSS custom property read through `var(--x)` must be declared.
 *
 * An undefined custom property fails silently: the declaration that uses it is
 * dropped (or falls back to the browser default), so the visual simply never
 * renders. Nothing else in the toolchain catches it.
 *
 * "Used" = every `var(--x)` in `frontend/src/**` (.css, .ts, .tsx, including
 * Tailwind arbitrary values such as `shadow-[0_0_20px_hsl(var(--accent)/0.2)]`)
 * plus `frontend/tailwind.config.js`.
 * "Declared" = every `--x:` declaration in a stylesheet under `frontend/src`
 * (the theme tokens live in `index.css`; the route stylesheets still declare a
 * few scoped variables until their Phase 4 removal).
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const frontendRoot = resolve(repoRoot, 'frontend');
const srcRoot = resolve(frontendRoot, 'src');

/**
 * Variables set at runtime by a third-party library, never by our stylesheets.
 * Every entry names the package that writes it (verified below against the
 * installed build, so a typo or a library rename cannot hide behind the
 * allowlist) and the consumer that reads it. Keep this list as short as possible.
 */
const RUNTIME_PROVIDED_VARS: Record<string, { pkg: string; reason: string }> = {
  // Radix Select (popper positioning) sets these on the content wrapper;
  // consumed by frontend/src/components/ui/select.tsx.
  '--radix-select-trigger-height': { pkg: '@radix-ui/react-select', reason: 'popper content wrapper' },
  '--radix-select-trigger-width': { pkg: '@radix-ui/react-select', reason: 'popper content wrapper' },
  // Radix Popover sets this on the popper wrapper; consumed by
  // frontend/src/components/ui/multi-select.tsx (panel matches trigger width).
  '--radix-popover-trigger-width': { pkg: '@radix-ui/react-popover', reason: 'popper content wrapper' },
  // Radix Toast writes this inline on the toast while it is swiped; consumed by
  // frontend/src/components/ui/toast.tsx (`data-[swipe=move]:translate-x-…`, the
  // toast follows the pointer). It is a pointer delta, so no stylesheet can own it.
  '--radix-toast-swipe-move-x': { pkg: '@radix-ui/react-toast', reason: 'inline style during a swipe gesture' },
  // …and this one when a swipe passes the dismiss threshold (the toast fades out where it was released).
  '--radix-toast-swipe-end-x': { pkg: '@radix-ui/react-toast', reason: 'inline style after a dismissing swipe' },
};

const SCANNED_EXTENSIONS = new Set(['.css', '.ts', '.tsx']);

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      return listFiles(full);
    }
    return SCANNED_EXTENSIONS.has(extname(entry.name)) ? [full] : [];
  });
}

function extractUsedVars(source: string): string[] {
  return [...source.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)].map((match) => match[1] as string);
}

function extractDeclaredVars(css: string): string[] {
  return [...css.matchAll(/(?<![\w-])(--[A-Za-z0-9_-]+)\s*:/g)].map((match) => match[1] as string);
}

const sourceFiles = listFiles(srcRoot);
const stylesheetFiles = sourceFiles.filter((file) => extname(file) === '.css');

const declared = new Set(
  stylesheetFiles.flatMap((file) => extractDeclaredVars(readFileSync(file, 'utf8'))),
);

const usages = new Map<string, Set<string>>();
for (const file of [...sourceFiles, resolve(frontendRoot, 'tailwind.config.js')]) {
  for (const name of extractUsedVars(readFileSync(file, 'utf8'))) {
    const files = usages.get(name) ?? new Set<string>();
    files.add(relative(repoRoot, file));
    usages.set(name, files);
  }
}

describe('CSS custom properties (DS-18)', () => {
  it('extracts usages and declarations the way the guard expects', () => {
    expect(extractUsedVars('a{color:hsl(var(--accent)/0.2)} b{x:var( --y-2 , red)}')).toEqual(['--accent', '--y-2']);
    expect(extractUsedVars("className='shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)]'")).toEqual(['--accent-rgb']);
    expect(extractDeclaredVars(':root{--accent: 210 100% 50%;--radius:0.5rem} a{color:var(--accent)}')).toEqual(['--accent', '--radius']);
  });

  it('scans a non-trivial source set', () => {
    expect(stylesheetFiles.map((file) => relative(srcRoot, file))).toContain('index.css');
    expect(declared.has('--accent')).toBe(true);
    expect(usages.size).toBeGreaterThan(10);
  });

  it('declares every var(--x) used in frontend/src and tailwind.config.js', () => {
    const undeclared = [...usages.entries()]
      .filter(([name]) => !declared.has(name) && !(name in RUNTIME_PROVIDED_VARS))
      .map(([name, files]) => `${name} (used in ${[...files].sort().join(', ')})`)
      .sort();

    expect(undeclared).toEqual([]);
  });

  it('keeps the runtime allowlist free of stale or shadowing entries', () => {
    for (const name of Object.keys(RUNTIME_PROVIDED_VARS)) {
      expect(usages.has(name), `${name} is no longer used; drop it from the allowlist`).toBe(true);
      expect(declared.has(name), `${name} is declared in a stylesheet; drop it from the allowlist`).toBe(false);
    }
  });

  it('only allowlists variables the named library actually sets', () => {
    const requireFromFrontend = createRequire(resolve(frontendRoot, 'package.json'));
    for (const [name, { pkg }] of Object.entries(RUNTIME_PROVIDED_VARS)) {
      const build = readFileSync(requireFromFrontend.resolve(pkg), 'utf8');
      expect(build.includes(name), `${pkg} does not set ${name}; fix the allowlist entry`).toBe(true);
    }
  });
});
