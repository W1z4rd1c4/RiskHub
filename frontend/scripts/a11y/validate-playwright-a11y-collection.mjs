#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDir, '../..');

export const REQUIRED_A11Y_SPECS = [
  'accessibility-smoke.spec.ts',
  'dora-ux-stateful-a11y.spec.ts',
  'dialog-render-sites.spec.ts',
];

export function assertA11ySpecsCollected(output) {
  const missing = REQUIRED_A11Y_SPECS.filter((spec) => !output.includes(spec));
  if (missing.length > 0) {
    throw new Error(`Playwright ci project did not collect required accessibility specs: ${missing.join(', ')}`);
  }
}

export function validatePlaywrightA11yCollection() {
  const playwright = resolve(frontendRoot, 'node_modules/.bin/playwright');
  const result = spawnSync(
    playwright,
    ['test', '-c', 'playwright.config.ts', '--project=ci', '--list'],
    { cwd: frontendRoot, env: process.env, encoding: 'utf8' },
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

  if (result.status !== 0) {
    throw new Error(`Playwright collection failed with exit ${result.status}:\n${output}`);
  }
  assertA11ySpecsCollected(output);
  console.log(`Playwright accessibility collection verified: ${REQUIRED_A11Y_SPECS.join(', ')}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validatePlaywrightA11yCollection();
}
