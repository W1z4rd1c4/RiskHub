import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

import {
  arrangeDialogContractSite,
  dialogContractActivation,
  dialogContractOpeners,
  DIALOG_CONTRACT_PARENT_SITE_IDS,
  installDialogContractApi,
} from './helpers/dialogContractHarness';
import { renderedContrast } from './helpers/renderedContrast';
import {
  auditRenderedContrast,
  type RenderedContrastAudit,
  type RenderedContrastCounts,
} from './helpers/renderedContrastAudit';

/*
 * G-RENDER (D15, NEW-V1-02): measured rendered contrast over the three themes.
 *
 * Every visible text element on the harness surfaces is measured with the
 * compositing algorithm of `helpers/renderedContrast.ts` and classified against
 * AA (4.5:1, 3:1 for large text), 3:1 and 1.5:1. Until Phase 3 exit the counts
 * are compared with `rendered-contrast-baseline.json` and may only go down.
 * Rewrite the baseline after an intended improvement with:
 *
 *   UPDATE_CONTRAST_BASELINE=1 npx playwright test -c playwright.workflow-contrast.config.ts \
 *     theme-rendered-contrast --workers=1
 *
 * `=1` refuses to raise a recorded count; `UPDATE_CONTRAST_BASELINE=force` is reserved for a
 * reviewed, explained increase (for example a new surface state that adds text).
 */

type AuditTheme = 'light' | 'riskhub' | 'dark';
type RatchetedMetric = 'belowAA' | 'below3' | 'below1_5' | 'whiteOnLight';
type BaselineEntry = Pick<RenderedContrastCounts, 'total' | RatchetedMetric>;

interface Baseline {
  description: string;
  totals: Record<AuditTheme, BaselineEntry>;
  surfaces: Record<AuditTheme, Record<string, BaselineEntry>>;
}

const THEMES: readonly AuditTheme[] = ['light', 'riskhub', 'dark'];
const RATCHETED: readonly RatchetedMetric[] = ['belowAA', 'below3', 'below1_5', 'whiteOnLight'];
const BASELINE_PATH = path.resolve(__dirname, 'rendered-contrast-baseline.json');
const BASELINE_MODE = process.env.UPDATE_CONTRAST_BASELINE;
const UPDATE_BASELINE = BASELINE_MODE === '1' || BASELINE_MODE === 'force';
const FORCE_BASELINE = BASELINE_MODE === 'force';

const HYBRID_AUTH_CONFIG = {
  auth_mode: 'hybrid_dev',
  demo_login_enabled: true,
  password_login_enabled: false,
  sso: { enabled: false, provider: 'entra', scopes: [] },
};

const WORKFLOW_STATES: Readonly<Record<string, readonly string[]>> = {
  history: ['normal', 'empty', 'breach'],
  approval: ['normal', 'reject', 'error', 'pending'],
  owner: ['normal', 'selected', 'error', 'empty', 'loading', 'lookup-error', 'limited'],
  questionnaire: ['normal', 'pending', 'submitting', 'readonly'],
};

/** `frontend/dialog-contract.html` owner surfaces and the dialog sites each one opens. */
const DIALOG_OWNERS: ReadonlyArray<{ owner: string; sites: readonly string[] }> = [
  { owner: 'link-management', sites: ['confirm.link-management'] },
  { owner: 'execution-history', sites: ['issue.execution-history'] },
  { owner: 'kri-form', sites: ['mismatch.kri-form'] },
  { owner: 'roles-panel', sites: ['role-modal.roles-panel', 'role-delete.roles-panel'] },
  { owner: 'risk-questionnaires-tab', sites: ['questionnaire.risk-detail-tab'] },
  { owner: 'risk-linked-controls', sites: ['link.risk-linked-controls', 'control-create.risk-linked-controls'] },
  { owner: 'vendor-linked-entities', sites: ['link.vendor-linked-entities'] },
  { owner: 'asset-links', sites: ['confirm.asset-links'] },
  { owner: 'vendor-contracts', sites: ['confirm.vendor-contracts'] },
  { owner: 'vendor-sub-outsourcing', sites: ['confirm.vendor-sub-outsourcing'] },
  { owner: 'governed-mutation-reason', sites: ['confirm.governed-mutation-reason'] },
  { owner: 'pending-change-cancellation', sites: ['confirm.pending-change-cancellation'] },
  { owner: 'dirty-task-guard', sites: ['confirm.dirty-task-guard'] },
  { owner: 'control-overview', sites: ['link.control-overview', 'risk-view.control-overview'] },
  { owner: 'dashboard-risk-sections', sites: ['risk-drilldown.dashboard'] },
  { owner: 'contextual-issue-action', sites: ['issue.contextual-action'] },
  { owner: 'departments-panel', sites: ['frame.departments', 'inline.departments-delete'] },
  { owner: 'risk-types-panel', sites: ['frame.risk-types', 'inline.risk-types-delete'] },
  { owner: 'approval-scenarios-panel', sites: ['frame.approval-scenarios'] },
];

function expectedSurfaceKeys(): string[] {
  return [
    ...Object.entries(WORKFLOW_STATES).flatMap(([family, states]) => states.map((state) => `workflow/${family}/${state}`)),
    ...DIALOG_OWNERS.flatMap(({ owner, sites }) => [
      `dialog/${owner}/closed`,
      ...sites.map((site) => `dialog/${site}/open`),
    ]),
  ].sort();
}

function readBaseline(): Baseline | null {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
}

function writeBaseline(update: (surfaces: Baseline['surfaces']) => void): void {
  const current = readBaseline();
  const surfaces = (current?.surfaces ?? {}) as Baseline['surfaces'];
  for (const theme of THEMES) surfaces[theme] ??= {};
  update(surfaces);
  const sortedSurfaces = Object.fromEntries(THEMES.map((theme) => [
    theme,
    Object.fromEntries(Object.entries(surfaces[theme]).sort(([left], [right]) => left.localeCompare(right))),
  ])) as Baseline['surfaces'];
  const totals = Object.fromEntries(THEMES.map((theme) => {
    const entries = Object.values(sortedSurfaces[theme]);
    const sum = (metric: keyof BaselineEntry) => entries.reduce((total, entry) => total + entry[metric], 0);
    return [theme, {
      total: sum('total'), belowAA: sum('belowAA'), below3: sum('below3'),
      below1_5: sum('below1_5'), whiteOnLight: sum('whiteOnLight'),
    }];
  })) as Baseline['totals'];
  const baseline: Baseline = {
    description: 'G-RENDER rendered-contrast ratchet (docs/audits/2026-09-30-frontend-ui-consistency-audit.md §4.1, §5.2 item 0.3). '
      + 'Counts of visible text elements per theme and harness surface; belowAA/below3/below1_5/whiteOnLight may only go down. '
      + 'Regenerate with UPDATE_CONTRAST_BASELINE=1 (see theme-rendered-contrast.spec.ts).',
    totals,
    surfaces: sortedSurfaces,
  };
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
}

async function enforceBaseline(
  testInfo: TestInfo,
  theme: AuditTheme,
  measured: Map<string, RenderedContrastAudit>,
): Promise<void> {
  await testInfo.attach(`rendered-contrast-${theme}`, {
    body: JSON.stringify(Object.fromEntries(measured), null, 2),
    contentType: 'application/json',
  });
  for (const [key, audit] of measured) {
    expect(audit.counts.total, `${theme} ${key} rendered no measurable text`).toBeGreaterThan(0);
  }
  if (UPDATE_BASELINE) {
    expect(testInfo.config.workers, 'UPDATE_CONTRAST_BASELINE must run with --workers=1').toBe(1);
    const previous = readBaseline()?.surfaces[theme] ?? {};
    const raised = [...measured].flatMap(([key, { counts }]) => RATCHETED
      .filter((metric) => previous[key] !== undefined && counts[metric] > previous[key]![metric])
      .map((metric) => `${key} ${metric} ${previous[key]![metric]} -> ${counts[metric]}`));
    if (!FORCE_BASELINE) {
      expect(raised, `${theme}: UPDATE_CONTRAST_BASELINE=1 only lowers counts; use =force for a reviewed increase`)
        .toEqual([]);
    }
    writeBaseline((surfaces) => {
      for (const [key, { counts }] of measured) {
        surfaces[theme][key] = {
          total: counts.total, belowAA: counts.belowAA, below3: counts.below3,
          below1_5: counts.below1_5, whiteOnLight: counts.whiteOnLight,
        };
      }
    });
    return;
  }
  const baseline = readBaseline();
  expect(baseline, `missing ${path.basename(BASELINE_PATH)}`).not.toBeNull();
  for (const [key, audit] of measured) {
    const recorded = baseline!.surfaces[theme]?.[key];
    expect.soft(recorded, `${theme} ${key} has no baseline entry; run with UPDATE_CONTRAST_BASELINE=1`).toBeTruthy();
    if (!recorded) continue;
    for (const metric of RATCHETED) {
      const message = `${theme} ${key}: ${metric} rose above the committed baseline (${recorded[metric]}). Worst: ${
        JSON.stringify(audit.failures.slice(0, 8))}`;
      expect.soft(audit.counts[metric], message).toBeLessThanOrEqual(recorded[metric]);
      if (audit.counts[metric] < recorded[metric]) {
        testInfo.annotations.push({
          type: 'rendered-contrast-improved',
          description: `${theme} ${key} ${metric} ${recorded[metric]} -> ${audit.counts[metric]}; lower the baseline`,
        });
      }
    }
  }
}

async function settle(page: Page, scope: Locator): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await scope.evaluate(async (element) => {
    const finite = element.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
  });
}

async function seedHarness(page: Page, theme: AuditTheme): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((value) => {
    localStorage.setItem('riskhub-theme', value);
    localStorage.setItem('riskhub-language', 'en');
  }, theme);
}

async function expectTheme(page: Page, theme: AuditTheme): Promise<void> {
  await expect(page.locator('html')).toHaveClass(new RegExp(`(^|\\s)theme-${theme}(\\s|$)`));
}

test.describe('G-RENDER rendered contrast baseline', () => {
  test('baseline covers exactly the measured surface matrix', () => {
    const expected = expectedSurfaceKeys();
    const ownedSites = DIALOG_OWNERS.flatMap(({ sites }) => sites).sort();
    expect(ownedSites, 'every dialog-contract parent site is measured').toEqual([...DIALOG_CONTRACT_PARENT_SITE_IDS].sort());
    if (UPDATE_BASELINE) {
      writeBaseline((surfaces) => {
        for (const theme of THEMES) {
          for (const key of Object.keys(surfaces[theme])) {
            if (!expected.includes(key)) delete surfaces[theme][key];
          }
        }
      });
      return;
    }
    const baseline = readBaseline();
    expect(baseline, `missing ${path.basename(BASELINE_PATH)}`).not.toBeNull();
    for (const theme of THEMES) {
      expect(Object.keys(baseline!.surfaces[theme] ?? {}).sort(), `${theme} baseline surfaces`).toEqual(expected);
    }
  });

  for (const theme of THEMES) {
    for (const [family, states] of Object.entries(WORKFLOW_STATES)) {
      test(`${theme}: workflow-contrast ${family} family`, async ({ page }, testInfo) => {
        await page.route('**/api/v1/**', (route) => (
          new URL(route.request().url()).pathname === '/api/v1/auth/config'
            ? route.fulfill({ json: HYBRID_AUTH_CONFIG })
            : route.fulfill({ status: 401, json: { detail: 'Not authenticated' } })
        ));
        await seedHarness(page, theme);
        const measured = new Map<string, RenderedContrastAudit>();
        for (const state of states) {
          await page.goto(`/workflow-contrast.html?theme=${theme}&locale=en&family=${family}&state=${state}`);
          await expectTheme(page, theme);
          const root = family === 'approval' ? page.getByRole('dialog') : page.locator('main');
          await expect(root.locator('h3, button').first()).toBeVisible();
          await settle(page, page.locator('body'));
          measured.set(`workflow/${family}/${state}`, await auditRenderedContrast(page.locator('body')));
        }
        await enforceBaseline(testInfo, theme, measured);
      });
    }

    for (const { owner, sites } of DIALOG_OWNERS) {
      test(`${theme}: dialog-contract ${owner} closed and opened`, async ({ page }, testInfo) => {
        test.setTimeout(120_000);
        const unexpectedNetwork: string[] = [];
        await seedHarness(page, theme);
        await installDialogContractApi(page, unexpectedNetwork, { theme, language: 'en' });
        const measured = new Map<string, RenderedContrastAudit>();
        for (const [index, site] of sites.entries()) {
          await arrangeDialogContractSite(page, site);
          await expectTheme(page, theme);
          const opener = dialogContractOpeners[site]!(page);
          await opener.waitFor({ state: 'visible', timeout: 15_000 });
          await page.waitForLoadState('networkidle');
          await settle(page, page.locator('body'));
          if (index === 0) {
            measured.set(`dialog/${owner}/closed`, await auditRenderedContrast(page.locator('body')));
          }

          const surfaces = page.locator('[role="dialog"], [role="alertdialog"]');
          const before = await surfaces.count();
          const activate = dialogContractActivation(site);
          if (activate) {
            await activate(opener);
          } else {
            await opener.focus();
            await opener.press('Space');
          }
          await expect(surfaces).toHaveCount(before + 1);
          const surface = surfaces.last();
          await expect(surface).toBeVisible();
          await page.waitForLoadState('networkidle');
          await settle(page, surface);
          measured.set(`dialog/${site}/open`, await auditRenderedContrast(surface));

          if (site === 'issue.contextual-action') {
            // Targeted probes: the typed issue title and the selected severity stay readable on
            // the (still dark) quick-create surface.
            const title = surface.getByRole('textbox').first();
            await title.fill('Rendered contrast probe');
            expect(await renderedContrast(title), `${theme} quick-create typed title`).toBeGreaterThanOrEqual(4.5);
            const severity = surface.getByRole('combobox', { name: 'Severity' });
            await severity.click();
            await page.getByRole('option', { name: 'High', exact: true }).click();
            await expect(severity).toHaveText('High');
            await page.mouse.move(0, 0);
            const selectedSeverity = severity.getByText('High', { exact: true });
            // Known NEW-V1-01 (DS-07): this dialog surface is still dark in light while ThemedSelect
            // is theme-aware, so the selected value measures 2.03:1 in light. Phase 2.1 (W6) moves the
            // surface and its inner text together; raise the light floor to 4.5 then.
            const severityFloor = theme === 'light' ? 2 : 4.5;
            expect(await renderedContrast(selectedSeverity), `${theme} quick-create selected severity`)
              .toBeGreaterThanOrEqual(severityFloor);
          }
        }
        expect(unexpectedNetwork, 'dialog-contract API mock covers every request').toEqual([]);
        await enforceBaseline(testInfo, theme, measured);
      });
    }
  }
});

const SSO_AUTH_CONFIG = {
  auth_mode: 'microsoft_sso',
  demo_login_enabled: false,
  password_login_enabled: false,
  sso: { enabled: true, provider: 'entra', scopes: [] },
  sso_error: null,
};

async function routeSsoLogin(page: Page): Promise<void> {
  await page.route('**/api/v1/**', (route) => (
    new URL(route.request().url()).pathname === '/api/v1/auth/config'
      ? route.fulfill({ json: SSO_AUTH_CONFIG })
      : route.fulfill({ status: 401, json: { detail: 'Not authenticated' } })
  ));
  await page.addInitScript(() => localStorage.setItem('riskhub-language', 'en'));
}

// Targeted RS-02 probes: on short viewports the SSO login scrolls instead of clipping, so the
// headline is not cut off above the viewport and the language switch is not occluded.
for (const viewport of [{ width: 1024, height: 600 }, { width: 1280, height: 600 }] as const) {
  test(`/login at ${viewport.width}x${viewport.height}: h1 is not clipped and the language switch is clickable`, async ({ page }) => {
    await routeSsoLogin(page);
    await page.setViewportSize(viewport);
    await page.goto('/login');
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    const top = await heading.evaluate((element) => element.getBoundingClientRect().top);
    expect(top, 'login h1 top').toBeGreaterThanOrEqual(0);
    const czech = page.getByRole('button', { name: 'CS', exact: true });
    // A trial click fails when another element (the sign-in card) would receive the pointer event.
    await czech.click({ trial: true, timeout: 5_000 });
    await czech.click();
    await expect(czech).toHaveAttribute('aria-pressed', 'true');
  });
}

test('<html lang> follows the language switch on the public login view', async ({ page }) => {
  await routeSsoLogin(page);
  await page.goto('/login');
  const czech = page.getByRole('button', { name: 'CS', exact: true });
  const english = page.getByRole('button', { name: 'EN', exact: true });
  await expect(english).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en');
  await czech.click();
  await expect(czech).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('cs');
  await english.click();
  await expect(english).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en');
});
