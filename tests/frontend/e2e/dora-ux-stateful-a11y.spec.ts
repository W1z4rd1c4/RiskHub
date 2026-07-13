/**
 * DORA UX — STATEFUL accessibility sweep (ADR-013 · FR-P1-5 · N10).
 *
 * The resting-DOM route scan in accessibility-smoke.spec.ts is necessary but not
 * sufficient (N10): "Route-level scans alone are insufficient." This suite drives
 * the DORA surfaces into the interactive states axe never sees at rest and scans
 * each with the SAME pinned WCAG tags the smoke uses (WCAG_TAGS) — zero-tolerance,
 * enforce-only (there is no baseline/capture path; every finding is a hard
 * failure fixed at the component source, never re-recorded — see
 * helpers/axeBaseline.ts).
 *
 * The five stateful drivers (N10), each axe-scanned across riskhub/light/dark:
 *   1. Opened DORA dialog (archive ConfirmDialog → DialogShell alertdialog):
 *      focus is trapped inside and RESTORED to the opener on Escape. Opened and
 *      Escaped only — never confirmed — so no seeded row is archived.
 *   2. Invalid DORA form submission (ProcessForm at /processes/new): the
 *      role="alert" summary + per-field Field errors are scanned.
 *   3. Open Radix listbox (the /processes ThemedSelect status filter).
 *   4. Expanded disclosure (the vendor sub-outsourcing chain group panel).
 *   5. Data-Quality + ICT-Committee loading AND error states, driven by
 *      intercepting each page's backing request (delay → loading, 500 → error).
 *
 * Assigned to the `ci` project only (playwright.config.ts CI_ONLY_SPECS), the
 * project e2e.yml runs and whose focus/timing behaviour these assertions target —
 * mirroring the smoke's N8 restriction.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

import { DEMO_ACCOUNTS, loginAsDemoUser } from './helpers/login';
import { waitForDataLoad } from './helpers/wait';
import { WCAG_TAGS, toFindings } from './helpers/axeBaseline';
import { getVendorByRegistration } from './helpers/api-auth';
import { getProcessByL1 } from './helpers/ict-register';
import { E2E_ICT_VENDOR, E2E_PROCESSES } from './fixtures/e2e-data';

type AuditTheme = 'riskhub' | 'light' | 'dark';
const THEMES: AuditTheme[] = ['riskhub', 'light', 'dark'];

// DORA loading/error surfaces (State 5). The frontend calls same-origin,
// relative `/api/v1/...` (services/api/apiConfig.ts), so a glob route intercepts
// cleanly. The page routes differ from the API paths: `/ict-register/dq` backs
// the /ict-register/data-quality page; `/ict-register/committee` backs the
// /?view=ict-committee dashboard tab.
const DQ_PAGE = '/ict-register/data-quality';
const COMMITTEE_PAGE = '/?view=ict-committee';
const DQ_ENDPOINT = '**/api/v1/ict-register/dq**';
const COMMITTEE_ENDPOINT = '**/api/v1/ict-register/committee**';

// Mirror the smoke's deterministic theming: seed the theme into localStorage
// before first paint AND stub the preferences GET, so every navigation renders
// in the target theme (ThemeContext reads both). addInitScript re-applies on
// each page.goto in this test.
async function seedTheme(page: Page, theme: AuditTheme): Promise<void> {
    await page.addInitScript(({ themeValue }) => {
        localStorage.setItem('riskhub-theme', themeValue);
        localStorage.setItem('riskhub-language', 'en');
    }, { themeValue: theme });

    await page.route('**/api/v1/preferences', async (route, request) => {
        if (request.method() !== 'GET') {
            await route.continue();
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ theme, language: 'en' }),
        });
    });
}

// Zero-tolerance enforce (N9): fail on EVERY violation the pinned WCAG tags
// select — NOT filtered by axe impact/severity, and with NO per-scan rule
// disables. There is no baseline for these states, so any finding must be fixed
// at the component source. `include` scopes the scan to the state under test
// where practical.
async function axeScanZero(page: Page, include: string[], label: string): Promise<void> {
    let builder = new AxeBuilder({ page }).withTags([...WCAG_TAGS]);
    for (const selector of include) {
        builder = builder.include(selector);
    }
    const analysis = await builder.analyze();
    const findings = toFindings(analysis.violations);
    expect(
        findings,
        `axe WCAG violations on "${label}" — zero-tolerance, enforce-only ` +
            `(fix at the component source; there is no baseline/capture path):\n` +
            findings.map((f) => `  [${f.rule}] impact=${f.impact ?? 'n/a'} ${f.selector}`).join('\n'),
    ).toEqual([]);
}

// STATE 3 — Open Radix listbox (ThemedSelect on a DORA surface). The /processes
// status filter is a real <ThemedSelect> the risk manager can read.
async function driveRadixListbox(page: Page, theme: AuditTheme): Promise<void> {
    await page.goto('/processes');
    await waitForDataLoad(page);

    const trigger = page.getByTestId('processes-status-filter-trigger');
    await trigger.waitFor({ state: 'visible' });
    await trigger.click();

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();

    await axeScanZero(
        page,
        ['[data-testid="processes-status-filter-trigger"]', '[role="listbox"]'],
        `Radix listbox open (${theme})`,
    );

    await page.keyboard.press('Escape');
    await expect(listbox).toHaveCount(0);
}

// STATE 2 — Invalid DORA form submission. Whitespace-only required identity
// fields on ProcessForm (noValidate, JS validation) surface the role="alert"
// summary + per-field Field errors (N11–N13).
async function driveInvalidForm(page: Page, theme: AuditTheme): Promise<void> {
    await page.goto('/processes/new');
    await waitForDataLoad(page);

    await page.getByTestId('process-form-l0-area').fill('   ');
    await page.getByTestId('process-form-l1-process').fill('   ');
    await page.getByTestId('process-form-submit').click();

    // The accessible error state (N12): a role="alert" summary AND per-field
    // Field wiring — the required inputs carry aria-invalid="true" (asserted by
    // attribute, not a localized string). Submission is suppressed (stays on /new).
    await expect(page.locator('[role="alert"]').first()).toBeVisible();
    await expect(page.getByTestId('process-form-l0-area')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('process-form-l1-process')).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL(/.*processes\/new$/);

    // Scope to the content landmark (MainLayout <main>) — the form, its alert
    // summary, and the aria-invalid fields, without the shared chrome.
    await axeScanZero(page, ['main'], `Invalid form error state (${theme})`);
}

// STATE 1 — Opened DORA dialog: focus trapping + restoration on the DialogShell
// alertdialog (the archive confirm is the only DORA-reachable DialogShell modal
// for the risk manager). Opened and Escaped ONLY — never confirmed — so the
// seeded process is not archived.
async function driveDialogFocusTrap(page: Page, theme: AuditTheme, processId: number): Promise<void> {
    await page.goto(`/processes/${processId}`);
    await waitForDataLoad(page);

    const opener = page.getByTestId('process-detail-archive');
    await opener.waitFor({ state: 'visible' });
    await opener.focus();
    await expect(opener).toBeFocused();
    await opener.click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();

    const focusInsideDialog = () =>
        page.evaluate(() => {
            const surface = document.querySelector('[role="alertdialog"]');
            return !!surface && surface.contains(document.activeElement);
        });

    // Focus is moved INTO the dialog on open. DialogShell defers the initial
    // focus via setTimeout(0), so poll rather than sampling once (avoids a race).
    await expect
        .poll(focusInsideDialog, { message: 'focus is moved into the dialog on open', timeout: 5000 })
        .toBe(true);

    // Full zero-tolerance scan of the opened dialog — structure, ARIA, accessible
    // names, focus order AND color-contrast. The ConfirmDialog danger button was
    // fixed at source (dark-red #ba3535 bg + white text-[#fff] that survives the
    // light-theme .text-white override), so color-contrast is enforced here like
    // every other state.
    await axeScanZero(page, ['[role="alertdialog"]'], `Open DORA dialog (${theme})`);

    // Focus TRAP: repeated Tab never escapes the dialog (DialogShell wraps
    // first<->last). Six presses cycle past the dialog's focusable count.
    for (let i = 1; i <= 6; i++) {
        await page.keyboard.press('Tab');
        await expect
            .poll(focusInsideDialog, { message: `focus stays trapped inside the dialog after Tab #${i}`, timeout: 3000 })
            .toBe(true);
    }

    // Escape closes (no confirm → no mutation) and RESTORES focus to the opener.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener, 'focus is restored to the opener on close').toBeFocused();
}

// STATE 4 — Expanded disclosure: the vendor sub-outsourcing chain group panel.
// Groups render expanded by default; toggle the disclosure closed→open to
// exercise it, then scan the expanded chain.
async function driveDisclosureChain(page: Page, theme: AuditTheme, vendorId: number): Promise<void> {
    await page.goto(`/vendors/${vendorId}?tab=sub-outsourcing`);
    await waitForDataLoad(page);

    const section = page.locator('#vendor-sub-outsourcing');
    await expect(section).toBeVisible();

    const group = page.locator('[data-testid^="vendor-sub-outsourcing-group-"]').first();
    await expect(group).toBeVisible();

    // Collapse if open, then expand — so the scan always targets a freshly
    // expanded panel and the aria-expanded/aria-controls disclosure is exercised.
    if ((await group.getAttribute('aria-expanded')) === 'true') {
        await group.click();
        await expect(group).toHaveAttribute('aria-expanded', 'false');
    }
    await group.click();
    await expect(group).toHaveAttribute('aria-expanded', 'true');

    const panelId = await group.getAttribute('aria-controls');
    if (panelId) {
        await expect(page.locator(`[id="${panelId}"]`)).toBeVisible();
    }

    await axeScanZero(page, ['#vendor-sub-outsourcing'], `Expanded sub-outsourcing chain (${theme})`);
}

// STATE 5 — DQ + Committee loading AND error states. Both screens render the
// full-screen loading/error branch only on the FIRST load (isLoading && !hasData
// / showErrorBlock), so route BEFORE each page.goto and never pre-warm.
async function driveLoadingAndError(
    page: Page,
    theme: AuditTheme,
    endpoint: string,
    route: string,
    loadingTestId: string,
    errorTestId: string,
    label: string,
): Promise<void> {
    // LOADING — hold the backing request open, scan the aria-busy spinner state.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const holdHandler = async (r: Route): Promise<void> => {
        await gate;
        try {
            await r.continue();
        } catch {
            /* the loading page was navigated away from — nothing to continue */
        }
    };
    await page.route(endpoint, holdHandler);
    // Do NOT waitForDataLoad here: [data-loading="true"] is intentionally held.
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId(loadingTestId)).toBeVisible({ timeout: 20000 });
    await axeScanZero(page, [`[data-testid="${loadingTestId}"]`], `${label} loading state (${theme})`);
    release();

    // ERROR — a terminal 500 handler registered on top (LIFO wins over the held
    // handler), on a fresh first load, renders the shared TableErrorState alert.
    const errorHandler = async (r: Route): Promise<void> => {
        try {
            await r.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ detail: 'E2E injected 500 (RN10 stateful a11y)' }),
            });
        } catch {
            /* superseded by a later navigation */
        }
    };
    await page.route(endpoint, errorHandler);
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId(errorTestId)).toBeVisible({ timeout: 20000 });
    await axeScanZero(page, [`[data-testid="${errorTestId}"]`], `${label} error state (${theme})`);

    await page.unroute(endpoint);
}

test.describe('DORA UX stateful accessibility (WCAG 2.2 AA tags, enforce-only)', () => {
    for (const theme of THEMES) {
        test(`DORA stateful surfaces have no axe violations in ${theme}`, async ({ page }) => {
            // ~8 navigations + login across five stateful surfaces; the default
            // 60s per-test budget is too tight for a serial single-worker walk.
            test.setTimeout(180000);

            await seedTheme(page, theme);
            await loginAsDemoUser(page, DEMO_ACCOUNTS.RISK_MANAGER);

            // Deterministic seeded anchors (Node-side, direct to BACKEND_URL).
            const process = await getProcessByL1(E2E_PROCESSES.CLAIMS_INTAKE.l1_process);
            expect(process, 'seeded process E2E-PROC-001 Claims Intake is present').not.toBeNull();
            const vendor = await getVendorByRegistration(E2E_ICT_VENDOR.registration_id);
            expect(vendor, 'seeded ICT vendor E2E-VREG-ICT-001 is present').not.toBeNull();

            await driveRadixListbox(page, theme); // State 3
            await driveInvalidForm(page, theme); // State 2
            await driveDialogFocusTrap(page, theme, process!.id); // State 1
            await driveDisclosureChain(page, theme, vendor!.id); // State 4
            // State 5 (last — it adds/removes route handlers).
            await driveLoadingAndError(
                page, theme, DQ_ENDPOINT, DQ_PAGE, 'dq-loading', 'dq-error', 'Data-Quality',
            );
            await driveLoadingAndError(
                page, theme, COMMITTEE_ENDPOINT, COMMITTEE_PAGE, 'committee-loading', 'committee-error', 'ICT Committee',
            );
        });
    }

    test('a real dialog keeps a portalled ThemedSelect in the active interaction layer', async ({ page }) => {
        await seedTheme(page, 'riskhub');
        await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO);
        await page.goto('/users');
        await waitForDataLoad(page);

        const opener = page.getByRole('button', { name: /edit access/i }).first();
        await opener.waitFor({ state: 'visible' });
        await opener.focus();
        await opener.click();

        const dialogRole = page.getByRole('dialog', { name: /edit access settings/i });
        await expect(dialogRole).toBeVisible();
        const dialog = page.locator('[role="dialog"]');
        await expect(dialog.getByTestId('access-edit-ready')).toBeVisible();

        const selectTrigger = dialog.getByRole('combobox').first();
        await selectTrigger.click();

        // Radix renders the listbox in a portal outside the DialogShell DOM,
        // while the modal itself remains open and semantically active.
        const listbox = page.getByRole('listbox');
        await expect(listbox).toBeVisible();
        await expect(dialog).toBeVisible();
        await expect.poll(async () => listbox.evaluate((node) => node.contains(document.activeElement)))
            .toBe(true);

        await axeScanZero(page, [], 'Access edit dialog with portalled ThemedSelect (riskhub)');

        await page.keyboard.press('Tab');
        await expect.poll(async () => page.evaluate(() => {
            const active = document.activeElement;
            const modal = document.querySelector('[role="dialog"]');
            const popup = document.querySelector('[role="listbox"]');
            return Boolean(active && (modal?.contains(active) || popup?.contains(active)));
        })).toBe(true);

        await page.keyboard.press('Escape');
        await expect(listbox).toHaveCount(0);
        await expect(dialog).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(opener).toBeFocused();
    });
});
