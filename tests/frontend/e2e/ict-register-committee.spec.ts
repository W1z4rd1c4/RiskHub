/**
 * ICT Register — ICT Risk Committee E2E (issues #51/#52/#64, deterministic).
 *
 * The Committee migrated from the standalone /ict-register/committee route to a
 * URL-addressable Dashboard tab at /?view=ict-committee (issue #64). The legacy
 * path now redirects there (<Navigate replace> — routing/business.tsx), and the
 * committee body renders as the ICT-committee dashboard tab via
 * <IctCommitteeSection>. This suite drives the new flow — the redirect, the
 * ?view= addressability with browser back/forward, and the capability gate —
 * while preserving the deterministic content proofs, which are HAND-DERIVED from
 * the seed and cross-checked live against the /ict-register/committee engine
 * output:
 *
 * - The ICT-linked risk slice is exactly E2E-RISK-001 (the only risk carrying
 *   Risk<->Process / Risk<->Asset links, seeded onto E2E-PROC-003 and
 *   E2E-ASSET-002): risk_count = 1.
 * - E2E-RISK-001 has net_score 4×5 = 20. With the app-scale risk-band config
 *   seeded (P_RizStr/Vys/Krit = 3/8/16, P_Tolerance = 7 — cutover-record §4),
 *   20 ≥ 16 bands **Kritické** and 20 > 7 is NAD TOLERANCI. This is the live
 *   proof of the app-scale band fix: gross 20 (Kritické) → net 20 (Kritické)
 *   lands the single risk in the migration matrix's Kritické→Kritické cell.
 * - The C7 "Materiální" KPI reads 13!material, which has no app column, so the
 *   payload flags it production-inert and the tile shows the muted "not yet
 *   measurable" state, never a silent 0.
 * - RoI readiness (#52) renders the 15 CIR 2024/2956 templates with per-
 *   template coverage badges and % bars; B_06.01 (Processes feed) carries gap
 *   rows that drill down to the offending Process detail pages.
 * - The tab is gated by ict_committee:read — an executive/oversight resource
 *   permission the risk-manager role holds but a department-scoped employee does
 *   not. Post-#64 the gate lives at the Dashboard tab: an unauthorized ?view= is
 *   normalized away to the overview (URL search stripped, no tab, no committee
 *   body, no committee fetch) rather than surfacing a standalone access-denied
 *   page.
 *
 * Controlled API/filter values remain canonical Czech source values, while
 * their ordinary UI labels follow the active English/Czech locale.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { test, expect } from './fixtures/auth.fixture';
import { E2E_ICT_REGISTER_RISK } from './fixtures/e2e-data';
import { assertZeroAxeFindings, toFindings, WCAG_TAGS } from './helpers/axeBaseline';
import { waitForDataLoad } from './helpers/wait';

// Legacy standalone route — now a <Navigate replace> to the Dashboard tab.
const LEGACY_COMMITTEE_PATH = '/ict-register/committee';

// Canonical values remain in test ids and drill-down parameters.
const BAND_CRITICAL = 'Kritické';
const DISPLAY_CRITICAL = /Critical|Kritické/;
const DISPLAY_OVER_TOLERANCE = /Above tolerance|NAD TOLERANCI/;

// Dual-language matchers — heading/KPI/coverage/tab text is localized. The ICT
// Committee tab renders as a <button> whose accessible name is the localized
// label (dashboard.json → views.ict_committee: "ICT Committee" / "Výbor pro
// řízení rizik ICT"); the Landmark icon contributes no accessible text.
const ICT_COMMITTEE_TAB = /ICT Committee|Výbor pro řízení rizik ICT/;
const NOT_MEASURABLE = /Not yet measurable|Zatím neměřitelné/;
const COVERAGE_FULL = /^(Full|Úplné)$/;
const COVERAGE_DOCUMENTARY = /^(Documentary|Dokumentační)$/;

async function openCommitteeTab(page: Page): Promise<void> {
    const currentUrl = new URL(page.url());
    if (currentUrl.pathname !== '/' || currentUrl.search !== '') {
        await page.getByRole('link', { name: /^Dashboard$/ }).click();
        await page.waitForURL((url) => url.pathname === '/' && url.search === '');
    }
    await page.getByRole('button', { name: ICT_COMMITTEE_TAB }).click();
    await page.waitForURL((url) => url.pathname === '/' && url.searchParams.get('view') === 'ict-committee');
    await waitForDataLoad(page);
}

async function setLocale(page: Page, locale: 'en' | 'cs'): Promise<void> {
    await page.unroute('**/api/v1/preferences');
    await page.route('**/api/v1/preferences', async (route, request) => {
        if (request.method() !== 'GET') {
            await route.continue();
            return;
        }
        await route.fulfill({ status: 200, json: { theme: 'riskhub', language: locale } });
    });
    await page.evaluate((language) => localStorage.setItem('riskhub-language', language), locale);
}

// The committee body (<IctCommitteeSection>) renders its 16_Dashboard section
// under this testid only once the committee payload has loaded.
const COMMITTEE_BODY = 'committee-dashboard';

test.describe('ICT Register — ICT Risk Committee tab (Deterministic)', () => {
    test('the legacy /ict-register/committee route redirects to the ?view=ict-committee tab', async ({
        riskManagerPage,
    }) => {
        await riskManagerPage.waitForLoadState('networkidle');
        await riskManagerPage.goto(LEGACY_COMMITTEE_PATH);
        await waitForDataLoad(riskManagerPage);

        // <Navigate replace> lands on the Dashboard tab, not a standalone page.
        await expect(riskManagerPage).toHaveURL(/\/\?view=ict-committee$/);
        // The committee body renders inside the dashboard.
        await expect(riskManagerPage.getByTestId(COMMITTEE_BODY)).toBeVisible();
        // The ICT Committee tab is the active tab (aria-current=page).
        await expect(riskManagerPage.getByRole('button', { name: ICT_COMMITTEE_TAB })).toHaveAttribute(
            'aria-current',
            'page',
        );
    });

    test('the committee tab is ?view=-addressable and browser back/forward move tabs', async ({ riskManagerPage }) => {
        // Start on the canonical overview (no ?view=). The risk-manager holds the
        // ict_committee capability, so the dashboard tab bar renders.
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage).toHaveURL((url) => url.pathname === '/' && url.search === '');
        await expect(riskManagerPage.getByTestId(COMMITTEE_BODY)).toHaveCount(0);

        // Clicking the ICT Committee tab pushes ?view=ict-committee (a history
        // entry, not a replace) and renders the committee body.
        await riskManagerPage.getByRole('button', { name: ICT_COMMITTEE_TAB }).click();
        await expect(riskManagerPage).toHaveURL(/\/\?view=ict-committee$/);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByTestId(COMMITTEE_BODY)).toBeVisible();

        // Browser BACK returns to the overview tab (param cleared, committee gone).
        await riskManagerPage.goBack();
        await expect.poll(() => {
            const url = new URL(riskManagerPage.url());
            return `${url.pathname}${url.search}`;
        }).toBe('/');
        await expect(riskManagerPage.getByTestId(COMMITTEE_BODY)).toHaveCount(0);

        // Browser FORWARD re-selects the committee tab.
        await riskManagerPage.goForward();
        await expect(riskManagerPage).toHaveURL(/\/\?view=ict-committee$/);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByTestId(COMMITTEE_BODY)).toBeVisible();
    });

    test('authorized user sees the dashboard tiles, heatmap, Top-10 and KPIs', async ({ riskManagerPage }) => {
        await openCommitteeTab(riskManagerPage);

        // Both output sheets render (16_Dashboard + 18_CRO_přehled).
        await expect(riskManagerPage.getByTestId('committee-dashboard')).toBeVisible();
        await expect(riskManagerPage.getByTestId('committee-cro')).toBeVisible();
        // The 5×5 heatmap and the 4×4 migration matrix.
        await expect(riskManagerPage.getByTestId('committee-heatmap')).toBeVisible();
        await expect(riskManagerPage.getByTestId('committee-migration')).toBeVisible();
        // A register-state tile carries a live count.
        await expect(riskManagerPage.getByTestId('committee-state-process_count')).toContainText(/\d/);
        // The ICT-linked risk slice is exactly the one seeded risk (the KPI
        // tile bundles its label + value, so target the value paragraph).
        await expect(riskManagerPage.getByTestId('committee-kpi-risk_count').locator('p').last()).toHaveText('1');
        // The Top-10 renders at least the seeded risk at rank 1.
        await expect(riskManagerPage.getByTestId('committee-top-risk-1')).toBeVisible();
    });

    test('a max-band risk shows the localized critical labels (proves the app-scale config)', async ({
        riskManagerPage,
    }) => {
        await openCommitteeTab(riskManagerPage);

        // The migration matrix Kritické(gross) → Kritické(net) cell holds the
        // single seeded risk: net 20 ≥ P_RizKrit(16) → Kritické. Under the old
        // workbook-scale config (80) this would have understated to a lower
        // band, so a non-zero cell here is the app-scale fix, live.
        await expect(
            riskManagerPage.getByTestId(`committee-migration-cell-${BAND_CRITICAL}-${BAND_CRITICAL}`),
        ).toHaveText('1');

        // The Top-10 row localizes the canonical band and tolerance values.
        const riskRow = riskManagerPage
            .locator('[data-testid^="committee-top-risk-"]')
            .filter({ hasText: E2E_ICT_REGISTER_RISK.code });
        await expect(riskRow).toHaveCount(1);
        await expect(riskRow).toContainText(DISPLAY_CRITICAL);
        await expect(riskRow).toContainText(DISPLAY_OVER_TOLERANCE);
    });

    test('controlled labels stay localized and axe-clean at both supported desktop viewports', async ({
        riskManagerPage,
    }) => {
        const states = [
            { locale: 'en' as const, viewport: { width: 1024, height: 768 }, band: 'Critical', tolerance: 'Above tolerance' },
            { locale: 'cs' as const, viewport: { width: 1440, height: 900 }, band: 'Kritické', tolerance: 'NAD TOLERANCI' },
        ];

        for (const state of states) {
            await riskManagerPage.setViewportSize(state.viewport);
            await setLocale(riskManagerPage, state.locale);
            await riskManagerPage.goto('/?view=ict-committee');
            await waitForDataLoad(riskManagerPage);

            const riskRow = riskManagerPage
                .locator('[data-testid^="committee-top-risk-"]')
                .filter({ hasText: E2E_ICT_REGISTER_RISK.code });
            await expect(riskRow).toContainText(state.band);
            await expect(riskRow).toContainText(state.tolerance);
            await expect(riskManagerPage.getByTestId(`committee-migration-cell-${BAND_CRITICAL}-${BAND_CRITICAL}`))
                .toHaveText('1');

            const result = await new AxeBuilder({ page: riskManagerPage }).withTags([...WCAG_TAGS]).analyze();
            assertZeroAxeFindings(
                toFindings(result.violations),
                `ICT Committee ${state.locale} ${state.viewport.width}x${state.viewport.height}`,
            );
        }
    });

    test('semantic drill-downs retain exact filters and show a removable summary in every destination register', async ({
        riskManagerPage,
    }) => {
        const cases = [
            {
                source: 'committee-kpi-risk_count',
                href: '/risks?committee_scope=true&ict_linked=true',
                summary: 'ICT-linked: Yes',
            },
            {
                source: 'committee-metric-cif_process_count',
                href: '/processes?cif=true',
                summary: 'Critical or important function: Yes',
            },
            {
                source: 'committee-state-process_asset_link_count',
                href: '/assets?committee_scope=true&has_process_link=true',
                summary: 'Linked to a process: Yes',
            },
            {
                source: 'committee-state-direct_process_vendor_link_count',
                href: '/vendors?committee_scope=true&has_direct_process_link=true',
                summary: 'Direct process link: Yes',
            },
            {
                source: `committee-migration-link-${BAND_CRITICAL}-${BAND_CRITICAL}`,
                href: '/risks?committee_scope=true&ict_linked=true&gross_band=Kritick%C3%A9&net_band=Kritick%C3%A9',
                summary: /Gross band: (Critical|Kritické)/,
            },
        ] as const;

        await openCommitteeTab(riskManagerPage);
        for (const [index, entry] of cases.entries()) {
            await test.step(entry.href, async () => {
                const source = riskManagerPage.getByTestId(entry.source);
                let link = source;
                if (!(await source.evaluate((node) => node.tagName === 'A'))) {
                    const descendant = source.locator('a').first();
                    link = (await descendant.count()) > 0 ? descendant : source.locator('xpath=ancestor::a[1]');
                }
                await link.click();
                await expect(riskManagerPage).toHaveURL((url) => {
                    const expectedUrl = new URL(entry.href, url.origin);
                    return url.pathname === expectedUrl.pathname
                        && url.searchParams.size === expectedUrl.searchParams.size
                        && [...expectedUrl.searchParams].every(
                            ([key, value]) => url.searchParams.get(key) === value,
                        );
                });
                await expect(riskManagerPage.getByTestId('semantic-filter-summary')).toContainText(entry.summary);
                if (index < cases.length - 1) {
                    await riskManagerPage.goBack();
                    await expect(riskManagerPage).toHaveURL(/\/\?view=ict-committee$/);
                    await waitForDataLoad(riskManagerPage);
                }
            });
        }
    });

    test('a chart value is a keyboard-accessible scoped register link', async ({ riskManagerPage }) => {
        await openCommitteeTab(riskManagerPage);
        const link = riskManagerPage.getByTestId('committee-asset-bar-Kritická');
        await expect(link).toHaveAttribute('href', '/assets?committee_scope=true&criticality=critical');
        await link.focus();
        await expect(link).toBeFocused();
        await riskManagerPage.keyboard.press('Enter');
        await expect(riskManagerPage).toHaveURL(/\/assets\?committee_scope=true&criticality=critical$/);
        await expect(riskManagerPage.getByTestId('assets-status-filter-trigger')).toBeDisabled();
        await riskManagerPage.getByTestId('semantic-filter-remove-committee_scope').click();
        await expect(riskManagerPage.getByTestId('assets-status-filter-trigger')).toBeEnabled();
    });

    test('the Materiální KPI shows the muted "not yet measurable" state', async ({ riskManagerPage }) => {
        await openCommitteeTab(riskManagerPage);

        // 13!material has no app column → production-inert: an em dash plus the
        // muted label, never a silent 0.
        const materialKpi = riskManagerPage.getByTestId('committee-kpi-material_risk_count');
        await expect(materialKpi).toContainText('—');
        await expect(materialKpi).toContainText(NOT_MEASURABLE);
    });

    test('the RoI-readiness section renders per-template coverage and a gap drill-down', async ({
        riskManagerPage,
    }) => {
        await openCommitteeTab(riskManagerPage);

        const roi = riskManagerPage.getByTestId('committee-roi');
        await expect(roi).toBeVisible();
        // Overall readiness renders as a percentage.
        await expect(riskManagerPage.getByTestId('committee-roi-overall')).toContainText('%');

        // Per-template coverage badges: a register-fed template reads its
        // coverage class; a note-only template reads Documentary.
        const b0601 = riskManagerPage.getByTestId('committee-roi-template-B_06.01');
        await expect(b0601).toBeVisible();
        await expect(b0601.getByText(COVERAGE_FULL)).toBeVisible();
        const b0101 = riskManagerPage.getByTestId('committee-roi-template-B_01.01');
        await expect(b0101.getByText(COVERAGE_DOCUMENTARY)).toBeVisible();

        // The gap drill-down expands the concrete offending rows, each linked
        // to its Process detail page (B_06.01 feeds from Processes).
        await riskManagerPage.getByTestId('committee-roi-toggle-B_06.01').click();
        const gaps = riskManagerPage.getByTestId('committee-roi-gaps-B_06.01');
        await expect(gaps).toBeVisible();
        await expect(gaps.locator('a[href^="/processes/"]').first()).toBeVisible();
    });

    test('a non-authorized base user (employee) is gated out of the committee tab', async ({ employeePage }) => {
        // The employee holds no ict_committee:read. Following the legacy redirect,
        // the Dashboard normalizes the unauthorized ?view= away to the overview:
        // the URL search is stripped, no committee body/loading renders, and the
        // ICT Committee tab is not offered (capability gate, post-#64).
        await employeePage.waitForLoadState('networkidle');
        await employeePage.goto(LEGACY_COMMITTEE_PATH);
        await waitForDataLoad(employeePage);

        // The unauthorized view is stripped — the address bar matches the overview.
        await expect.poll(() => new URL(employeePage.url()).search).toBe('');
        // No committee content renders, and no committee fetch spinner is shown.
        await expect(employeePage.getByTestId('committee-dashboard')).toHaveCount(0);
        await expect(employeePage.getByTestId('committee-loading')).toHaveCount(0);
        // The tab is not offered.
        await expect(employeePage.getByRole('button', { name: ICT_COMMITTEE_TAB })).toHaveCount(0);
    });
});
