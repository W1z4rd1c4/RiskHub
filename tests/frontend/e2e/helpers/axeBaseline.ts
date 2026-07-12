/**
 * Rule/selector axe baseline (ADR-013 · FR-P1-5 · N9).
 *
 * The extended accessibility smoke fails on EVERY violation the pinned WCAG tags
 * select (NOT filtered by axe `impact`/severity). Because the app is still broken,
 * existing violations are held by this committed, shrink-only baseline:
 *
 *   - fingerprint: `${ruleId}||${JSON.stringify(target)}`  (rule + selector, N9)
 *   - cell key:    project → theme → route
 *   - a current fingerprint NOT in its cell  -> reported as NEW (fails the test)
 *   - a cell fingerprint NOT seen this run   -> reported as STALE (fails; only-shrink)
 *
 * Capture / shrink the baseline by re-running the smoke in update mode. Update
 * mode is gated ONLY on the explicit env var (see `isAxeBaselineUpdateMode`);
 * Playwright's `--update-snapshots` deliberately does NOT trigger it, so CI —
 * whose `updateSnapshots` default is "missing" (NOT "none") — always ENFORCES:
 *   UPDATE_A11Y_AXE_BASELINE=1 npx playwright test -c playwright.config.ts \
 *     ../tests/frontend/e2e/accessibility-smoke.spec.ts --project=ci --workers=1
 * Use `--workers=1` — the CI default — so the read-modify-write of the single
 * JSON is race-free. Commit the result; it may only shrink as later phases fix
 * violations.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { TestInfo } from '@playwright/test';

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

/**
 * True ONLY when the run is explicitly (re)capturing the baseline via the
 * dedicated env var. This is the enforced seam: gating on `UPDATE_A11Y_AXE_BASELINE`
 * alone means Playwright's `--update-snapshots` — whose CI default is "missing"
 * (NOT "none") — can NEVER silently rewrite the accessibility ledger, so CI always
 * ENFORCES `expect(drift).toEqual([])` instead of auto-recapturing.
 */
export function isAxeBaselineUpdateMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.UPDATE_A11Y_AXE_BASELINE === '1';
}

/**
 * Back-compat wrapper for the smoke spec's `isUpdateMode(testInfo)` call. The
 * `testInfo` arg is intentionally ignored — update mode is env-gated only (see
 * `isAxeBaselineUpdateMode`); the `testInfo.config.updateSnapshots !== 'none'`
 * path was REMOVED so `--update-snapshots` can never rewrite the ledger.
 */
export function isUpdateMode(_testInfo: TestInfo): boolean {
  return isAxeBaselineUpdateMode();
}

/** Overwrite one project/theme/route cell with the current findings (shrink-only in practice). */
export function updateBaselineCell(project: string, theme: string, route: string, current: AxeFinding[]): void {
  const baseline = readBaseline();
  const byProject = (baseline[project] ??= {});
  const byTheme = (byProject[theme] ??= {});
  byTheme[route] = [...new Set(current.map(fingerprint))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  fs.writeFileSync(AXE_BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
}
