import { describe, expect, it } from 'vitest';

import {
  assertZeroAxeFindings,
  AXE_BASELINE_ROUTES,
  AXE_BASELINE_THEMES,
  validateZeroAxeBaseline,
  type AxeFinding,
} from '../../../e2e/helpers/axeBaseline';

function validEvidence() {
  return JSON.stringify({
    ci: Object.fromEntries(AXE_BASELINE_THEMES.map((theme) => [
      theme,
      Object.fromEntries(AXE_BASELINE_ROUTES.map((route) => [route, []])),
    ])),
  });
}

describe('axe evidence is immutable strict-zero policy', () => {
  it('accepts the exact required project/theme/route matrix only when every cell is empty', () => {
    expect(() => validateZeroAxeBaseline(validEvidence())).not.toThrow();
  });

  it('rejects malformed, missing, extra, and non-empty evidence cells', () => {
    expect(() => validateZeroAxeBaseline('{')).toThrow();
    expect(() => validateZeroAxeBaseline('{}')).toThrow(/ci/);

    const missing = JSON.parse(validEvidence());
    delete missing.ci.riskhub['/controls'];
    expect(() => validateZeroAxeBaseline(JSON.stringify(missing))).toThrow(/controls/);

    const extra = JSON.parse(validEvidence());
    extra.ci.riskhub['/not-a-real-scan'] = [];
    expect(() => validateZeroAxeBaseline(JSON.stringify(extra))).toThrow(/not-a-real-scan/);

    const widened = JSON.parse(validEvidence());
    widened.ci.dark['/risks'] = ['color-contrast||["#hidden"]'];
    expect(() => validateZeroAxeBaseline(JSON.stringify(widened))).toThrow(/zero/);
  });

  it('fails directly for any axe finding', () => {
    const finding: AxeFinding = {
      rule: 'color-contrast',
      selector: JSON.stringify(['#x']),
      help: 'Elements must have sufficient color contrast',
      impact: 'serious',
    };
    expect(() => assertZeroAxeFindings([finding], 'riskhub /risks')).toThrow(/color-contrast/);
    expect(() => assertZeroAxeFindings([], 'riskhub /risks')).not.toThrow();
  });
});
