import { describe, expect, it } from 'vitest';

import {
  assertA11ySpecsCollected,
  REQUIRED_A11Y_SPECS,
} from '../../../../../frontend/scripts/a11y/validate-playwright-a11y-collection.mjs';

describe('Playwright accessibility collection guard', () => {
  it('accepts output only when both required accessibility suites are collected', () => {
    const output = REQUIRED_A11Y_SPECS.map((spec) => `  [ci] › ${spec}:1:1 › collected`).join('\n');

    expect(() => assertA11ySpecsCollected(output)).not.toThrow();
  });

  it('fails closed when either required accessibility suite is absent', () => {
    expect(() => assertA11ySpecsCollected(`[ci] › ${REQUIRED_A11Y_SPECS[0]}:1:1 › collected`))
      .toThrow(/dora-ux-stateful-a11y\.spec\.ts/);
  });
});
