import { afterEach, describe, expect, it, vi } from 'vitest';

import { isAxeBaselineUpdateMode, isUpdateMode } from '../../../e2e/helpers/axeBaseline';

/**
 * Commit 5b · Deliverable 1 — the axe enforcement seam.
 *
 * Regression guard for the hole where `isUpdateMode` returned true whenever
 * `testInfo.config.updateSnapshots !== 'none'`. Playwright's CI default is
 * "missing" (NOT "none"), so update mode was TRUE on every CI run and the smoke
 * suite re-captured the baseline instead of enforcing `expect(drift).toEqual([])`.
 * These tests pin update mode to the explicit `UPDATE_A11Y_AXE_BASELINE` env var.
 */

// A minimal TestInfo stand-in carrying only the `config.updateSnapshots` the old,
// removed code path read. The wrapper must IGNORE it entirely.
type TestInfoArg = Parameters<typeof isUpdateMode>[0];
function fakeTestInfo(updateSnapshots: 'missing' | 'all' | 'none'): TestInfoArg {
  return { config: { updateSnapshots } } as unknown as TestInfoArg;
}

describe('isAxeBaselineUpdateMode (pure env seam)', () => {
  it('is TRUE only when UPDATE_A11Y_AXE_BASELINE === "1"', () => {
    expect(isAxeBaselineUpdateMode({ UPDATE_A11Y_AXE_BASELINE: '1' })).toBe(true);
  });

  it('is FALSE when the env var is unset', () => {
    expect(isAxeBaselineUpdateMode({})).toBe(false);
  });

  it('is FALSE for any other value (only the literal "1" opts in)', () => {
    expect(isAxeBaselineUpdateMode({ UPDATE_A11Y_AXE_BASELINE: '0' })).toBe(false);
    expect(isAxeBaselineUpdateMode({ UPDATE_A11Y_AXE_BASELINE: 'true' })).toBe(false);
    expect(isAxeBaselineUpdateMode({ UPDATE_A11Y_AXE_BASELINE: '' })).toBe(false);
  });
});

describe('isUpdateMode wrapper — updateSnapshots can no longer flip it', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // The removed hole: on CI `updateSnapshots` is "missing", not "none". Prove that
  // NONE of the three Playwright values enables update mode while the env var is unset.
  it.each(['missing', 'all', 'none'] as const)(
    'is FALSE with env unset regardless of updateSnapshots=%s',
    (mode) => {
      vi.stubEnv('UPDATE_A11Y_AXE_BASELINE', undefined);
      expect(isUpdateMode(fakeTestInfo(mode))).toBe(false);
    },
  );

  it.each(['missing', 'all', 'none'] as const)(
    'is TRUE only via the env var, independent of updateSnapshots=%s',
    (mode) => {
      vi.stubEnv('UPDATE_A11Y_AXE_BASELINE', '1');
      expect(isUpdateMode(fakeTestInfo(mode))).toBe(true);
    },
  );
});
