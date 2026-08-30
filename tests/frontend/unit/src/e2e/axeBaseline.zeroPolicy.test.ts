import { describe, expect, it } from 'vitest';

import {
  assertZeroAxeFindings,
  AXE_BASELINE_ROUTES,
  AXE_BASELINE_THEMES,
  validateZeroAxeBaseline,
  type AxeFinding,
} from '../../../e2e/helpers/axeBaseline';

const REQUIRED_LOGICAL_ROUTES = [
  '/',
  '/controls',
  '/risks',
  '/settings',
  '/vendors',
  '/processes',
  '/assets',
  '/threats',
  '/ict-register/data-quality',
  '/?view=ict-committee',
  '/issues',
  '/kris',
  '/departments',
  '/approvals',
  '/activity-log',
  '/governance',
  '/notifications',
  '/vendor-reports',
  '/users',
  '/risk-hub',
  '/controls/:id',
  '/risks/:id',
  '/kris/:id',
  '/departments/:id',
  '/vendors/:id',
  '/admin',
  '/admin/docs',
] as const;

function validEvidence() {
  return JSON.stringify({
    ci: Object.fromEntries(AXE_BASELINE_THEMES.map((theme) => [
      theme,
      Object.fromEntries(AXE_BASELINE_ROUTES.map((route) => [route, []])),
    ])),
  });
}

describe('axe evidence is immutable strict-zero policy', () => {
  it('pins exactly 27 logical routes per theme and 81 empty evidence cells', () => {
    expect(AXE_BASELINE_ROUTES).toEqual(REQUIRED_LOGICAL_ROUTES);

    const evidence = JSON.parse(validEvidence()) as {
      ci: Record<string, Record<string, unknown[]>>;
    };
    const cells = Object.values(evidence.ci).flatMap((routes) => Object.values(routes));
    expect(cells).toHaveLength(81);
    expect(cells.every((cell) => cell.length === 0)).toBe(true);
  });

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
