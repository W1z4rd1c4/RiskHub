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
 * AA (4.5:1, 3:1 for large text), 3:1 and 1.5:1. Since the Phase 3 exit the spec
 * is a HARD ZERO (audit §5.5 phase exit, §5.6 exit criteria): no surface may
 * render a text element below AA, or white text on a light background, in any
 * theme. There is no baseline file and no update mode.
 */

type AuditTheme = 'light' | 'riskhub' | 'dark';
type ZeroMetric = Extract<keyof RenderedContrastCounts, 'belowAA' | 'below3' | 'below1_5' | 'whiteOnLight'>;

const THEMES: readonly AuditTheme[] = ['light', 'riskhub', 'dark'];
const ZERO_METRICS: readonly ZeroMetric[] = ['belowAA', 'below3', 'below1_5', 'whiteOnLight'];

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
  { owner: 'threat-risk-links', sites: ['confirm.threat-risk-links'] },
  { owner: 'risk-register-links', sites: ['confirm.risk-register-links'] },
  { owner: 'risk-questionnaires-panel', sites: ['send.risk-questionnaires-panel'] },
];

/**
 * `frontend/design-system.html` (audit §5.3 exit criterion): one `data-ds-section` per primitive
 * family, the opened modal surfaces (`?dialog=`), and the public `AuthFrame` (`?view=`).
 */
const DESIGN_SYSTEM_SECTIONS = [
  'page-header', 'buttons', 'forms', 'badges', 'surfaces', 'navigation', 'tables', 'states', 'feedback',
] as const;
const DESIGN_SYSTEM_DIALOGS = [
  'shell', 'confirm-archive', 'confirm-delete', 'confirm-unlink', 'confirm-send', 'confirm-discard', 'confirm-revoke',
  'confirm-generic',
] as const;
/** `auth-frame`: signed out, no stored theme → OS scheme; `auth-frame-app-theme`: stored theme kept → `<html>` theme. */
const DESIGN_SYSTEM_VIEWS = ['auth-frame', 'auth-frame-app-theme'] as const;

/** Attaches the measurements and fails every surface with a text element below AA (hard zero). */
async function enforceZero(
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
    for (const metric of ZERO_METRICS) {
      expect.soft(
        audit.counts[metric],
        `${theme} ${key}: ${metric} must be 0 (G-RENDER hard zero). Worst: ${JSON.stringify(audit.failures.slice(0, 8))}`,
      ).toBe(0);
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

test.describe('G-RENDER rendered contrast (hard zero)', () => {
  test('measures every dialog-contract parent site', () => {
    const ownedSites = DIALOG_OWNERS.flatMap(({ sites }) => sites).sort();
    expect(ownedSites, 'every dialog-contract parent site is measured').toEqual([...DIALOG_CONTRACT_PARENT_SITE_IDS].sort());
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
        await enforceZero(testInfo, theme, measured);
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
            // the themed quick-create surface in every theme.
            const title = surface.getByRole('textbox').first();
            await title.fill('Rendered contrast probe');
            expect(await renderedContrast(title), `${theme} quick-create typed title`).toBeGreaterThanOrEqual(4.5);
            const severity = surface.getByRole('combobox', { name: 'Severity' });
            await severity.click();
            await page.getByRole('option', { name: 'High', exact: true }).click();
            await expect(severity).toHaveText('High');
            await page.mouse.move(0, 0);
            const selectedSeverity = severity.getByText('High', { exact: true });
            // NEW-V1-01 (DS-07) fixed in Phase 2.1 (W6): the dialog surface and its inner text are
            // tokenised together, so the selected value meets AA in light as in the dark themes.
            expect(await renderedContrast(selectedSeverity), `${theme} quick-create selected severity`)
              .toBeGreaterThanOrEqual(4.5);
          }
        }
        expect(unexpectedNetwork, 'dialog-contract API mock covers every request').toEqual([]);
        await enforceZero(testInfo, theme, measured);
      });
    }

    test(`${theme}: design-system primitives, dialogs and public frame`, async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      const requests: string[] = [];
      await page.route('**/api/v1/**', (route) => {
        requests.push(route.request().url());
        return route.fulfill({ status: 404, json: { detail: 'Not found' } });
      });
      await seedHarness(page, theme);
      // Without an app theme AuthFrame follows the OS scheme (D14): dark → RiskHub tokens, light → Light tokens.
      await page.emulateMedia({ colorScheme: theme === 'light' ? 'light' : 'dark' });
      const measured = new Map<string, RenderedContrastAudit>();

      await page.goto(`/design-system.html?theme=${theme}&locale=en`);
      await expectTheme(page, theme);
      await expect(page.getByTestId('design-system-ready')).toBeVisible();
      for (const section of DESIGN_SYSTEM_SECTIONS) {
        const scope = page.locator(`[data-ds-section="${section}"]`);
        await expect(scope).toBeVisible();
        await settle(page, scope);
        measured.set(`design-system/${section}`, await auditRenderedContrast(scope));
      }

      for (const dialog of DESIGN_SYSTEM_DIALOGS) {
        await page.goto(`/design-system.html?theme=${theme}&locale=en&dialog=${dialog}`);
        await expectTheme(page, theme);
        const surface = page.locator('[role="dialog"], [role="alertdialog"]');
        await expect(surface).toHaveCount(1);
        await expect(surface).toBeVisible();
        await settle(page, surface);
        measured.set(`design-system/dialog/${dialog}/open`, await auditRenderedContrast(surface));
      }

      for (const view of DESIGN_SYSTEM_VIEWS) {
        await page.goto(`/design-system.html?theme=${theme}&locale=en&view=${view}`);
        const main = page.getByRole('main');
        if (view === 'auth-frame') {
          await expect(main).toHaveAttribute('data-theme-source', 'system');
          await expect(main).toHaveClass(new RegExp(`(^|\\s)theme-${theme === 'light' ? 'light' : 'riskhub'}(\\s|$)`));
        } else {
          // A stored (signed-in) app theme wins over the OS scheme: the frame inherits <html>.
          await expect(main).toHaveAttribute('data-theme-source', 'app');
          await expect(main).not.toHaveClass(/(^|\s)theme-/);
          await expectTheme(page, theme);
        }
        // The fixture renders a blocking error, which takes focus over the h1.
        await expect(page.getByRole('alert')).toBeFocused();
        await settle(page, main);
        measured.set(`design-system/view/${view}`, await auditRenderedContrast(main));
      }

      expect(requests, 'the design-system harness makes no API requests').toEqual([]);
      await enforceZero(testInfo, theme, measured);
    });
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

// D14 / DS-24 (Phase 3i): the production SSO login sits on AuthFrame, follows the OS colour scheme
// (light → Light tokens, dark → RiskHub tokens) and every visible text element meets AA in both.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`/login (SSO) with OS ${colorScheme} scheme: themed public frame, all text at AA`, async ({ page }, testInfo) => {
    await routeSsoLogin(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme });
    await page.goto('/login');
    const main = page.getByRole('main');
    await expect(main).toHaveAttribute('data-theme-source', 'system');
    await expect(main).toHaveClass(new RegExp(`(^|\\s)theme-${colorScheme === 'light' ? 'light' : 'riskhub'}(\\s|$)`));
    await expect(page.getByRole('button', { name: 'Continue with Microsoft' })).toBeVisible();
    await settle(page, main);
    const audit = await auditRenderedContrast(main);
    await testInfo.attach(`login-sso-${colorScheme}.json`, {
      body: JSON.stringify(audit, null, 2),
      contentType: 'application/json',
    });
    expect(audit.counts.total, 'measured text elements').toBeGreaterThan(10);
    expect(audit.counts.skippedGradient, 'no gradient backdrop left on the login').toBe(0);
    expect(audit.failures, `${colorScheme} login text below AA`).toEqual([]);
  });
}
