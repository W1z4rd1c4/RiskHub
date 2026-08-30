/**
 * Strict-zero axe helpers (ADR-013 · FR-P1-5).
 *
 * The JSON artifact is audit evidence only. Its exact ci/theme/route matrix must
 * be present and every cell must remain empty. Findings are asserted directly;
 * there is no accepted fingerprint, capture, or update mechanism.
 */
import fs from 'node:fs';
import path from 'node:path';

export const AXE_BASELINE_PATH = path.resolve(__dirname, '..', 'accessibility-axe-baseline.json');
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const;
export const AXE_BASELINE_THEMES = ['riskhub', 'light', 'dark'] as const;
export const AXE_BASELINE_ROUTES = [
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

export interface AxeLikeViolation {
  id: string;
  help: string;
  impact?: string | null;
  nodes: Array<{ target: unknown }>;
}

export interface AxeFinding {
  rule: string;
  selector: string;
  help: string;
  impact: string | null;
}

export function toFindings(violations: AxeLikeViolation[]): AxeFinding[] {
  return violations.flatMap((violation) => violation.nodes.map((node) => ({
    rule: violation.id,
    selector: JSON.stringify(node.target),
    help: violation.help,
    impact: violation.impact ?? null,
  })));
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string) {
  const actual = Object.keys(value);
  const missing = expected.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !expected.includes(key));
  if (missing.length || extra.length) {
    throw new Error(`${label} keys drifted; missing=${missing.join(',') || 'none'} extra=${extra.join(',') || 'none'}`);
  }
}

export function validateZeroAxeBaseline(source: string): void {
  const root = objectRecord(JSON.parse(source), 'axe evidence');
  assertExactKeys(root, ['ci'], 'axe evidence project');
  const ci = objectRecord(root.ci, 'axe evidence ci project');
  assertExactKeys(ci, AXE_BASELINE_THEMES, 'axe evidence themes');

  for (const theme of AXE_BASELINE_THEMES) {
    const routes = objectRecord(ci[theme], `axe evidence ${theme} routes`);
    assertExactKeys(routes, AXE_BASELINE_ROUTES, `axe evidence ${theme} routes`);
    for (const route of AXE_BASELINE_ROUTES) {
      const cell = routes[route];
      if (!Array.isArray(cell)) throw new Error(`axe evidence ${theme} ${route} must be an array`);
      if (cell.length !== 0) throw new Error(`axe evidence ${theme} ${route} must contain zero fingerprints`);
    }
  }
}

export function validateCommittedZeroAxeBaseline(): void {
  validateZeroAxeBaseline(fs.readFileSync(AXE_BASELINE_PATH, 'utf8'));
}

export function assertZeroAxeFindings(findings: AxeFinding[], label: string): void {
  if (findings.length === 0) return;
  const detail = findings
    .map((finding) => `[${finding.rule}] impact=${finding.impact ?? 'n/a'} ${finding.selector}`)
    .join('\n');
  throw new Error(`axe strict-zero violation on ${label}:\n${detail}`);
}
