import { describe, expect, it } from 'vitest';

import { resolveRiskTypeCode } from '@/components/risk-form/riskTypeDefaults';

describe('resolveRiskTypeCode', () => {
  it('keeps the current risk type when it exists in config', () => {
    expect(
      resolveRiskTypeCode('strategic', [
        { code: 'strategic' },
        { code: 'cyber' },
      ]),
    ).toBe('strategic');
  });

  it('falls back to the first configured risk type when the current value is missing', () => {
    expect(
      resolveRiskTypeCode(undefined, [
        { code: 'cyber' },
        { code: 'compliance' },
      ]),
    ).toBe('cyber');
  });

  it('falls back to the first configured risk type when the current value is stale', () => {
    expect(
      resolveRiskTypeCode('operational', [
        { code: 'cyber' },
        { code: 'compliance' },
      ]),
    ).toBe('cyber');
  });

  it('retains the legacy fallback only when no config options are available', () => {
    expect(resolveRiskTypeCode(undefined, [])).toBe('operational');
  });
});
