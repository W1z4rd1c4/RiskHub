/**
 * Rule/selector axe baseline (ADR-013 · FR-P1-5 · N9) — ENFORCE-ONLY, zero-tolerance.
 *
 * The extended accessibility smoke fails on EVERY violation the pinned WCAG tags
 * select (NOT filtered by axe `impact`/severity). The committed baseline
 * (accessibility-axe-baseline.json) has reached its terminal shrink-only state —
 * every cell is `[]` — so this helper ENFORCES only: any axe finding on any scanned
 * state is a hard failure. There is NO capture/overwrite path; a violation can only
 * be resolved by fixing the app, never by re-recording the ledger.
 *
 *   - fingerprint: `${ruleId}||${JSON.stringify(target)}`  (rule + selector, N9)
 *   - cell key:    project → theme → route
 *   - `diffCell` against the (empty) cell reports every current finding as NEW,
 *     which fails the smoke. `fingerprint`/`diffCell` are retained only to render a
 *     clear, per-finding failure message — not to re-record the ledger.
 */
import fs from 'node:fs';
import path from 'node:path';

// Playwright compiles these suites as CommonJS (the repo root has no `"type":
// "module"`), so `__dirname` is the loader-consistent way to locate the baseline
// — matching readme_screenshots.spec.ts. `import.meta.url` is not available here.
export const AXE_BASELINE_PATH = path.resolve(__dirname, '..', 'accessibility-axe-baseline.json');

export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const;

/** Minimal structural shape of an axe violation (avoids depending on axe-core type exports). */
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

type BaselineCell = string[];
type BaselineShape = Record<string, Record<string, Record<string, BaselineCell>>>;

export function fingerprint(finding: Pick<AxeFinding, 'rule' | 'selector'>): string {
  return `${finding.rule}||${finding.selector}`;
}

/** Flatten every violation into one finding per offending node. NOT filtered by impact (N9). */
export function toFindings(violations: AxeLikeViolation[]): AxeFinding[] {
  const findings: AxeFinding[] = [];
  for (const violation of violations) {
    for (const node of violation.nodes) {
      findings.push({
        rule: violation.id,
        selector: JSON.stringify(node.target),
        help: violation.help,
        impact: violation.impact ?? null,
      });
    }
  }
  return findings;
}

function readBaseline(): BaselineShape {
  try {
    const raw = fs.readFileSync(AXE_BASELINE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as BaselineShape;
    return {};
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

export function loadBaselineCell(project: string, theme: string, route: string): BaselineCell {
  return readBaseline()[project]?.[theme]?.[route] ?? [];
}

export interface BaselineDiff {
  route: string;
  newFindings: AxeFinding[];
  staleFingerprints: string[];
}

export function diffCell(route: string, cell: BaselineCell, current: AxeFinding[]): BaselineDiff {
  const currentByFingerprint = new Map(current.map((f) => [fingerprint(f), f]));
  const currentFingerprints = new Set(currentByFingerprint.keys());
  const cellSet = new Set(cell);
  return {
    route,
    newFindings: [...currentByFingerprint].filter(([fp]) => !cellSet.has(fp)).map(([, f]) => f),
    staleFingerprints: cell.filter((fp) => !currentFingerprints.has(fp)),
  };
}
