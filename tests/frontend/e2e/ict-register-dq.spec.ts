/**
 * ICT Register — Data-Quality page E2E (issue #50, deterministic fixtures).
 *
 * Drives the /ict-register/data-quality surface (IctRegisterDqPage) against
 * the seeded register graph. Every expected value is HAND-DERIVED from the
 * deterministic seed and cross-checked live against the /ict-register/dq
 * engine output:
 *
 * - The catalog is the workbook's fixed 52 checks — always rendered, threshold
 *   0, OK/NÁLEZ per D>E (dq.py DQ_CHECK_CATALOG). The summary "checks" tile
 *   therefore reads 52 regardless of data.
 * - DQ-38 (sub-outsourcing chain error) fires on exactly the seeded broken
 *   cross-contract row (E2E-SUB-BROKEN, predecessor on E2E-CTR-001 while it
 *   sits on E2E-CTR-002 → the "?" rank sentinel → CHYBA ŘETĚZCE). count = 1,
 *   the single violating sub-outsourcing row drills down to its owning Vendor.
 * - DQ-23 (assessment overdue) is production-inert: the app Risk register
 *   tracks no assessment date, so the loader maps it None forever and the
 *   check reads OK+production_inert — the page shows the muted "not yet
 *   measurable" pill, never a false OK.
 * - The page is gated by vendors:read (the /ict-register API surface pattern):
 *   an employee (department-scoped, vendors:read) sees it; the platform admin
 *   (no business permissions) is blocked with the read-access-denied state.
 *
 * Localized pill/heading text is matched with dual EN/CS regexes (the app may
 * render either language under E2E), following the vendor-derived precedent;
 * the workbook-verbatim API values (check ids, "NÁLEZ") stay language-neutral.
 */
import { test, expect } from './fixtures/auth.fixture';
import { E2E_ICT_VENDOR } from './fixtures/e2e-data';
import { getVendorByRegistration } from './helpers/api-auth';
import { waitForDataLoad } from './helpers/wait';

const DQ_PAGE = '/ict-register/data-quality';

// The full workbook catalog is fixed at 52 rows (dq.py DQ_CHECK_CATALOG).
const TOTAL_DQ_CHECKS = 52;

// Dual-language matchers — the status pills and access heading are localized.
const FINDING_PILL = /^(Finding|NÁLEZ)$/;
const NOT_MEASURABLE = /Not yet measurable|Zatím neměřitelné/;
const ACCESS_DENIED = /Access Denied|Přístup zamítnut/;

// The seeded broken sub-outsourcing row that uniquely drives DQ-38.
const BROKEN_SUB_LABEL = 'E2E-SUB-BROKEN Cross-Contract Orphan';

test.describe('ICT Register — Data Quality page (Deterministic)', () => {
    test('renders the fixed 52-check catalog with the summary tiles', async ({ riskManagerPage }) => {
        await riskManagerPage.goto(DQ_PAGE);
        await waitForDataLoad(riskManagerPage);

        await expect(riskManagerPage.getByTestId('dq-check-list')).toBeVisible();
        // The summary "checks" tile is the catalog length — always 52.
        await expect(riskManagerPage.getByTestId('dq-summary-total')).toHaveText(String(TOTAL_DQ_CHECKS));
        // One row per catalog check (dq-check-DQ-01 … dq-check-DQ-52).
        await expect(riskManagerPage.locator('[data-testid^="dq-check-DQ-"]')).toHaveCount(TOTAL_DQ_CHECKS);

        // The seed produces real findings, so the findings tile is non-zero.
        const findings = await riskManagerPage.getByTestId('dq-summary-findings').innerText();
        expect(Number(findings)).toBeGreaterThan(0);
    });

    test('a known finding (DQ-38 chain error) shows its count and drills down to the vendor', async ({
        riskManagerPage,
    }) => {
        const vendor = await getVendorByRegistration(E2E_ICT_VENDOR.registration_id);
        expect(vendor).not.toBeNull();

        await riskManagerPage.goto(DQ_PAGE);
        await waitForDataLoad(riskManagerPage);

        // NÁLEZ status + the deterministic count of exactly one broken chain row.
        await expect(riskManagerPage.getByTestId('dq-status-DQ-38')).toHaveText(FINDING_PILL);
        await expect(riskManagerPage.getByTestId('dq-count-DQ-38')).toHaveText('1');

        // Expanding surfaces the violating sub-outsourcing row, linked to its
        // owning Vendor's detail page (the DQ route shape for supply-chain rows).
        await riskManagerPage.getByTestId('dq-check-DQ-38').click();
        const rows = riskManagerPage.getByTestId('dq-rows-DQ-38');
        await expect(rows).toBeVisible();
        const drilldown = rows.locator(`a[href="/vendors/${vendor!.id}"]`);
        await expect(drilldown).toContainText(BROKEN_SUB_LABEL);
    });

    test('?check=DQ-38 deep link auto-expands the producing check', async ({ riskManagerPage }) => {
        // The committee drill-down deep link pre-expands the check on load.
        await riskManagerPage.goto(`${DQ_PAGE}?check=DQ-38`);
        await waitForDataLoad(riskManagerPage);

        await expect(riskManagerPage.getByTestId('dq-rows-DQ-38')).toBeVisible();
        await expect(riskManagerPage.getByTestId('dq-rows-DQ-38')).toContainText(BROKEN_SUB_LABEL);
    });

    test('?status=findings filters the list to findings only', async ({ riskManagerPage }) => {
        await riskManagerPage.goto(`${DQ_PAGE}?status=findings`);
        await waitForDataLoad(riskManagerPage);

        // A firing check stays; a passing/inert check (DQ-23, always OK on
        // production data) drops out of the findings-only view.
        await expect(riskManagerPage.getByTestId('dq-check-DQ-38')).toBeVisible();
        await expect(riskManagerPage.getByTestId('dq-check-DQ-23')).toHaveCount(0);
    });

    test('a production-inert check (DQ-23) shows the muted "not yet measurable" state, not a false OK', async ({
        riskManagerPage,
    }) => {
        await riskManagerPage.goto(DQ_PAGE);
        await waitForDataLoad(riskManagerPage);

        // DQ-23 reads OK+production_inert → the muted pill, distinct from the
        // green OK pill: never a false OK.
        await expect(riskManagerPage.getByTestId('dq-status-DQ-23')).toHaveText(NOT_MEASURABLE);
    });

    test('is gated by vendors:read — an employee sees it, the platform admin is blocked', async ({
        employeePage,
        adminPage,
    }) => {
        // Department-scoped employee holds vendors:read → the page renders.
        await employeePage.goto(DQ_PAGE);
        await waitForDataLoad(employeePage);
        await expect(employeePage.getByTestId('dq-check-list')).toBeVisible();
        await expect(employeePage.locator('[data-testid^="dq-check-DQ-"]')).toHaveCount(TOTAL_DQ_CHECKS);

        // Platform admin holds no business permissions → read-access-denied.
        await adminPage.goto(DQ_PAGE);
        await waitForDataLoad(adminPage);
        await expect(adminPage.getByRole('heading', { name: ACCESS_DENIED })).toBeVisible();
        await expect(adminPage.getByTestId('dq-check-list')).toHaveCount(0);
    });
});
