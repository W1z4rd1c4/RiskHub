import { describe, expect, it } from 'vitest';

import {
  assertNoDisabledA11yTests,
  assertA11ySpecsCollected,
  REQUIRED_A11Y_SPECS,
} from '../../../../../frontend/scripts/a11y/validate-playwright-a11y-collection.mjs';
import { assertA11ySpecsExecuted } from '../../../../../frontend/scripts/a11y/validate-playwright-a11y-results.mjs';

describe('Playwright accessibility collection guard', () => {
  it('accepts output only when all required accessibility suites are collected', () => {
    const output = REQUIRED_A11Y_SPECS.map((spec) => `  [ci] › ${spec}:1:1 › collected`).join('\n');

    expect(() => assertA11ySpecsCollected(output)).not.toThrow();
  });

  it('fails closed when either required accessibility suite is absent', () => {
    expect(() => assertA11ySpecsCollected(`[ci] › ${REQUIRED_A11Y_SPECS[0]}:1:1 › collected`))
      .toThrow(/dora-ux-stateful-a11y\.spec\.ts/);
  });

  it('rejects skip and fixme annotations in required accessibility suites', () => {
    expect(() => assertNoDisabledA11yTests(new Map([
      ['accessibility-smoke.spec.ts', "test.skip('temporarily disabled', async () => {});"],
    ]))).toThrow(/skip or fixme/i);
    expect(() => assertNoDisabledA11yTests(new Map([
      ['dora-ux-stateful-a11y.spec.ts', "test.describe.fixme('disabled', () => {});"],
    ]))).toThrow(/skip or fixme/i);
  });

  it('accepts ordinary tests without disabled annotations', () => {
    expect(() => assertNoDisabledA11yTests(new Map([
      ['dialog-render-sites.spec.ts', "test('runs', async () => {});"],
    ]))).not.toThrow();
  });

  it('requires passed ci results for every required accessibility file', () => {
    const report = {
      suites: REQUIRED_A11Y_SPECS.map((file) => ({
        file,
        specs: [{
          file,
          title: `${file} contract`,
          tests: [{ projectName: 'ci', status: 'expected', results: [{ status: 'passed' }] }],
        }],
      })),
    };
    expect(() => assertA11ySpecsExecuted(report)).not.toThrow();

    const skipped = structuredClone(report);
    skipped.suites[1]!.specs[0]!.tests[0] = { projectName: 'ci', status: 'skipped', results: [] };
    expect(() => assertA11ySpecsExecuted(skipped)).toThrow(/skipped or did not pass/i);
  });
});
