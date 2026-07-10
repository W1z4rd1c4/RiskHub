/**
 * ICT Register — ICT Risk Committee page E2E (issues #51/#52, deterministic).
 *
 * Drives the /ict-register/committee surface (IctRegisterCommitteePage)
 * against the seeded register graph. Every expected value is HAND-DERIVED
 * from the deterministic seed and cross-checked live against the
 * /ict-register/committee engine output:
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
 * - The page is gated by ict_committee:read — an executive/oversight resource
 *   permission the risk-manager role holds but a department-scoped employee
 *   does not; the employee is blocked with the read-access-denied state.
 *
 * Band labels ("Kritické", "NAD TOLERANCI") are workbook-verbatim API values
 * and stay language-neutral; localized pill/heading/badge text is matched with
 * dual EN/CS regexes (the vendor-derived precedent).
 */
import { test, expect } from './fixtures/auth.fixture';
import { E2E_ICT_REGISTER_RISK } from './fixtures/e2e-data';
import { waitForDataLoad } from './helpers/wait';

const COMMITTEE_PAGE = '/ict-register/committee';

// Workbook-verbatim band labels the API serves regardless of UI language.
const BAND_CRITICAL = 'Kritické';
const OVER_TOLERANCE = 'NAD TOLERANCI';

// Dual-language matchers — heading/KPI/coverage text is localized.
const ACCESS_DENIED = /Access Denied|Přístup zamítnut/;
const NOT_MEASURABLE = /Not yet measurable|Zatím neměřitelné/;
const COVERAGE_FULL = /^(Full|Úplné)$/;
const COVERAGE_DOCUMENTARY = /^(Documentary|Dokumentační)$/;

test.describe('ICT Register — ICT Risk Committee page (Deterministic)', () => {
    test('authorized user sees the dashboard tiles, heatmap, Top-10 and KPIs', async ({
        riskManagerPage,
    }) => {
        await riskManagerPage.goto(COMMITTEE_PAGE);
        await waitForDataLoad(riskManagerPage);

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
        await expect(
            riskManagerPage.getByTestId('committee-kpi-risk_count').locator('p').last(),
        ).toHaveText('1');
        // The Top-10 renders at least the seeded risk at rank 1.
        await expect(riskManagerPage.getByTestId('committee-top-risk-1')).toBeVisible();
    });

    test('a max-band risk shows Kritické in the band visuals (proves the app-scale config)', async ({
        riskManagerPage,
    }) => {
        await riskManagerPage.goto(COMMITTEE_PAGE);
        await waitForDataLoad(riskManagerPage);

        // The migration matrix Kritické(gross) → Kritické(net) cell holds the
        // single seeded risk: net 20 ≥ P_RizKrit(16) → Kritické. Under the old
        // workbook-scale config (80) this would have understated to a lower
        // band, so a non-zero cell here is the app-scale fix, live.
        await expect(
            riskManagerPage.getByTestId(`committee-migration-cell-${BAND_CRITICAL}-${BAND_CRITICAL}`),
        ).toHaveText('1');

        // The Top-10 row for the seeded risk carries the Kritické band pill and
        // the NAD TOLERANCI marker (net 20 > P_Tolerance 7).
        const riskRow = riskManagerPage
            .locator('[data-testid^="committee-top-risk-"]')
            .filter({ hasText: E2E_ICT_REGISTER_RISK.code });
        await expect(riskRow).toHaveCount(1);
        await expect(riskRow).toContainText(BAND_CRITICAL);
        await expect(riskRow).toContainText(OVER_TOLERANCE);
    });

    test('the Materiální KPI shows the muted "not yet measurable" state', async ({ riskManagerPage }) => {
        await riskManagerPage.goto(COMMITTEE_PAGE);
        await waitForDataLoad(riskManagerPage);

        // 13!material has no app column → production-inert: an em dash plus the
        // muted label, never a silent 0.
        const materialKpi = riskManagerPage.getByTestId('committee-kpi-material_risk_count');
        await expect(materialKpi).toContainText('—');
        await expect(materialKpi).toContainText(NOT_MEASURABLE);
    });

    test('the RoI-readiness section renders per-template coverage and a gap drill-down', async ({
        riskManagerPage,
    }) => {
        await riskManagerPage.goto(COMMITTEE_PAGE);
        await waitForDataLoad(riskManagerPage);

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

    test('a non-authorized base user (employee) is blocked', async ({ employeePage }) => {
        // The employee holds no ict_committee:read → read-access-denied, no tiles.
        await employeePage.goto(COMMITTEE_PAGE);
        await waitForDataLoad(employeePage);

        await expect(employeePage.getByRole('heading', { name: ACCESS_DENIED })).toBeVisible();
        await expect(employeePage.getByTestId('committee-dashboard')).toHaveCount(0);
    });
});
