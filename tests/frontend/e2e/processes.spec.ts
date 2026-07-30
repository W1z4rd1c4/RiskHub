/**
 * ICT Register — Process register E2E (issues #42 + #48, deterministic fixtures).
 *
 * Asserts CURRENT behavior: canonical Process relationships and controlled
 * values round-trip through the UI with localized presentation,
 * and the ENGINE-DERIVED values (score, criticality class, CIF — ticket #48)
 * render read-only on the register and the detail, never as inputs.
 */
import { test, expect } from './fixtures/auth.fixture';
import { E2E_PROCESSES } from './fixtures/e2e-data';
import {
    createProcessViaApi,
    ensureProcessArchived,
    getProcessByL1,
    postProcessExpectingStatus,
} from './helpers/ict-register';
import { waitForDataLoad } from './helpers/wait';
import { ProcessesPage } from './pages/ProcessesPage';

// Canonical stored codes are presented through the active UI locale, never as
// raw `low` / `medium` / `high` / `critical` values.
const CRITICALITY_LABELS = {
    low: /^(Low|Nízká)$/,
    medium: /^(Medium|Střední)$/,
    high: /^(High|Vysoká)$/,
    critical: /^(Critical|Kritická)$/,
} as const;
const CIF_YES_LABEL = /^(Yes|Ano)$/;
// Skala15 — verbatim workbook closed list.
const SKALA_15 = ['1', '2', '3', '4', '5'];

const ARCHIVE_CONFIRM_BUTTON = /^(Archive|Archivovat)$/;

test.describe('ICT Register — Processes (Deterministic)', () => {
    test('Risk manager sees Processes in the sidebar and navigates to the register', async ({ riskManagerPage }) => {
        await riskManagerPage.goto('/');
        const navLink = riskManagerPage.locator('nav a[href="/processes"]');
        await expect(navLink).toBeVisible();

        await navLink.click();
        await riskManagerPage.waitForURL(/.*processes$/);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByTestId('processes-search-input')).toBeVisible();
        await expect(riskManagerPage.getByTestId('processes-create-button')).toBeVisible();
    });

    test('Process owner can edit their record but cannot create or archive Processes', async ({ employeePage }) => {
        await employeePage.goto('/');
        await expect(employeePage.locator('nav a[href="/processes"]')).toBeVisible();

        const processesPage = new ProcessesPage(employeePage);
        await processesPage.navigate();
        await processesPage.search(E2E_PROCESSES.CLAIMS_INTAKE.l1_process);
        await expect(processesPage.rowByText(E2E_PROCESSES.CLAIMS_INTAKE.l1_process)).toBeVisible();
        await expect(processesPage.createButton).toHaveCount(0);

        await processesPage.openRowByText(E2E_PROCESSES.CLAIMS_INTAKE.l1_process);
        await expect(employeePage.getByTestId('process-detail-back')).toBeVisible();
        // Jana is the seeded Process owner: record-specific edit is granted by
        // backend capabilities even though the base Employee role has no
        // register-wide Process write permission.
        await expect(employeePage.getByTestId('process-detail-edit')).toBeVisible();
        await expect(employeePage.getByTestId('process-detail-archive')).toHaveCount(0);
    });

    test('Platform admin does not see Processes navigation', async ({ adminPage }) => {
        // Anchor on the admin-only console link before asserting the absence.
        await expect(adminPage.locator('a[href="/admin"]').first()).toBeVisible();
        await expect(adminPage.locator('a[href="/processes"]')).toHaveCount(0);
    });

    test('Register lists the seeded deterministic processes', async ({ riskManagerPage }) => {
        const processesPage = new ProcessesPage(riskManagerPage);
        await processesPage.navigate();
        await processesPage.search('E2E-PROC');

        await expect(processesPage.rowByText(E2E_PROCESSES.CLAIMS_INTAKE.l1_process)).toBeVisible();
        await expect(processesPage.rowByText(E2E_PROCESSES.REGULATORY_REPORTING.l1_process)).toBeVisible();
        await expect(processesPage.rowByText(E2E_PROCESSES.PORTAL_SUPPORT.l1_process)).toBeVisible();
        // Ticket #48: the register localizes the ENGINE-derived canonical
        // class. E2E-PROC-003 is seeded with impacts 2/2/5/4 + MTPD 72h:
        // score 13 + default bonus 1 = 14 -> high; the live score WINS over
        // its entered preliminary class `critical`.
        const reportingRow = processesPage.rowByText(E2E_PROCESSES.REGULATORY_REPORTING.l1_process);
        await expect(reportingRow.getByText(CRITICALITY_LABELS.high)).toBeVisible();
        // Its derived CIF is yes: the seeded override takes precedence
        // (and the regulatory axis at 5 would trigger it anyway).
        await expect(reportingRow.getByText(CIF_YES_LABEL)).toBeVisible();
        // E2E-PROC-001 (impacts 4/3/4/3 + MTPD 24h -> 14 + bonus 3 = 17) bands
        // to the canonical `critical` class and localizes it.
        const claimsRow = processesPage.rowByText(E2E_PROCESSES.CLAIMS_INTAKE.l1_process);
        await expect(claimsRow.getByText(CRITICALITY_LABELS.critical)).toBeVisible();
    });

    test('Search narrows the register to the matching seeded row', async ({ riskManagerPage }) => {
        const processesPage = new ProcessesPage(riskManagerPage);
        await processesPage.navigate();
        await processesPage.search(E2E_PROCESSES.REGULATORY_REPORTING.l1_process);

        await expect(processesPage.rowByText(E2E_PROCESSES.REGULATORY_REPORTING.l1_process)).toBeVisible();
        await expect(processesPage.tableRows.filter({ hasText: E2E_PROCESSES.CLAIMS_INTAKE.l1_process })).toHaveCount(0);
    });

    test('Archived process appears only under the Archived status filter', async ({ riskManagerPage }) => {
        const archivedId = await ensureProcessArchived(E2E_PROCESSES.ARCHIVED.l1_process, true);

        const processesPage = new ProcessesPage(riskManagerPage);
        await processesPage.navigate();
        await processesPage.search(E2E_PROCESSES.ARCHIVED.l1_process);
        await expect(processesPage.tableRows.filter({ hasText: E2E_PROCESSES.ARCHIVED.l1_process })).toHaveCount(0);

        await processesPage.setStatusFilterArchived();
        await expect(processesPage.rowByText(E2E_PROCESSES.ARCHIVED.l1_process)).toBeVisible();
        // The archived row exposes its restore affordance to the risk manager.
        await expect(riskManagerPage.getByTestId(`process-restore-${archivedId}`)).toBeVisible();
    });

    test('Create flow offers verbatim workbook closed lists and lands on a detail with a stable F-code', async ({ riskManagerPage }) => {
        const uniqueName = `E2E-PROC-UI Created ${Date.now()}`;

        const processesPage = new ProcessesPage(riskManagerPage);
        await processesPage.navigate();
        await processesPage.createButton.click();
        await riskManagerPage.waitForURL(/.*processes\/new$/);

        // The dropdown presents all four canonical codes through the active locale.
        await riskManagerPage.getByTestId('process-form-preliminary-criticality').click();
        const criticalityOptions = riskManagerPage.getByRole('option');
        await expect(criticalityOptions).toHaveCount(Object.keys(CRITICALITY_LABELS).length + 1); // + "Not set"
        for (const label of Object.values(CRITICALITY_LABELS)) {
            await expect(riskManagerPage.getByRole('option', { name: label })).toBeVisible();
        }
        await riskManagerPage.getByRole('option', { name: CRITICALITY_LABELS.high }).click();

        // Impact dimension dropdown carries Skala15 verbatim (1–5 only).
        await riskManagerPage.getByTestId('process-form-impact-client').click();
        await expect(riskManagerPage.getByRole('option')).toHaveCount(SKALA_15.length + 1);
        await riskManagerPage.getByRole('option', { name: '4', exact: true }).click();

        await riskManagerPage.getByTestId('process-form-l0-area').fill('E2E Claims');
        await riskManagerPage.getByTestId('process-form-l1-process').fill(uniqueName);
        await riskManagerPage.getByTestId('process-form-l2-subprocess').fill('UI create flow');
        await riskManagerPage.getByTestId('process-form-owner').click();
        await riskManagerPage.getByRole('option', { name: /Jana Horáková.*ops\.analyst@riskhub\.local/ }).click();
        await expect(riskManagerPage.getByTestId('process-form-owner-department')).toContainText('Operations');
        await riskManagerPage.getByTestId('process-form-submit').click();

        await riskManagerPage.waitForURL(/.*processes\/\d+$/);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.locator('main h1').first()).toContainText(uniqueName);
        // Server-assigned stable F-code (F{id}), never entered by hand.
        await expect(riskManagerPage.getByText(/^F\d+$/).first()).toBeVisible();
        await expect(riskManagerPage.getByText(CRITICALITY_LABELS.high).first()).toBeVisible();

        const created = await getProcessByL1(uniqueName);
        expect(created).not.toBeNull();
        expect(created!.f_code).toMatch(/^F\d+$/);
    });

    test('Process Owner auto-fills only an empty Department and permits a cross-Department assignment', async ({ riskManagerPage }) => {
        const uniqueName = `E2E-PROC-XDEPT ${Date.now()}`;
        await riskManagerPage.goto('/processes/new');
        await waitForDataLoad(riskManagerPage);

        await riskManagerPage.getByTestId('process-form-l0-area').fill('E2E Cross Department');
        await riskManagerPage.getByTestId('process-form-l1-process').fill(uniqueName);
        await riskManagerPage.getByTestId('process-form-owner').click();
        await riskManagerPage.getByRole('option', { name: /Barbora Němcová.*it\.analyst@riskhub\.local/ }).click();
        await expect(riskManagerPage.getByTestId('process-form-owner-department')).toContainText('IT');

        await riskManagerPage.getByTestId('process-form-owner-department').click();
        await riskManagerPage.getByRole('option', { name: /Operations.*OPS/ }).click();
        await riskManagerPage.getByTestId('process-form-submit').click();

        await riskManagerPage.waitForURL(/.*processes\/\d+$/);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByText('Barbora Němcová', { exact: true })).toBeVisible();
        await expect(riskManagerPage.getByText(/IT · employee/i)).toBeVisible();
        await expect(riskManagerPage.getByText('it.analyst@riskhub.local', { exact: true })).toHaveCount(0);
        await expect(riskManagerPage.getByText('Operations (OPS)')).toBeVisible();
    });

    test('Whitespace-only identity fields surface the required-field validation error', async ({ riskManagerPage }) => {
        await riskManagerPage.goto('/processes/new');
        await waitForDataLoad(riskManagerPage);

        await riskManagerPage.getByTestId('process-form-l0-area').fill('   ');
        await riskManagerPage.getByTestId('process-form-l1-process').fill('   ');
        await riskManagerPage.getByTestId('process-form-submit').click();

        await expect(riskManagerPage.getByRole('alert')).toContainText(
            /Please correct the highlighted fields|Opravte zvýrazněná pole/,
        );
        await expect(riskManagerPage.getByText(/L0 area is required|L0 oblast je povinná/)).toBeVisible();
        await expect(riskManagerPage.getByText(/L1 process is required|L1 proces je povinný/)).toBeVisible();
        await expect(riskManagerPage.getByTestId('process-form-l0-area')).toBeFocused();
        await expect(riskManagerPage).toHaveURL(/.*processes\/new$/);
    });

    test('Impact dimensions outside the 1–5 Skala15 scale are rejected', async ({ riskManagerPage }) => {
        // The form cannot even offer an out-of-range impact: the dropdown is
        // the closed Skala15 list (exactly 1–5, no 0 or 6).
        await riskManagerPage.goto('/processes/new');
        await waitForDataLoad(riskManagerPage);
        await riskManagerPage.getByTestId('process-form-impact-financial').click();
        await expect(riskManagerPage.getByRole('option')).toHaveCount(SKALA_15.length + 1);
        for (const value of SKALA_15) {
            await expect(riskManagerPage.getByRole('option', { name: value, exact: true })).toBeVisible();
        }
        await expect(riskManagerPage.getByRole('option', { name: '0', exact: true })).toHaveCount(0);
        await expect(riskManagerPage.getByRole('option', { name: '6', exact: true })).toHaveCount(0);
        await riskManagerPage.keyboard.press('Escape');

        // The API boundary rejects out-of-range and non-strict-int impacts (422).
        expect(
            await postProcessExpectingStatus({
                l0_area: 'E2E Claims',
                l1_process: `E2E-PROC-INVALID ${Date.now()}`,
                impact_client: 6,
            }),
        ).toBe(422);
        expect(
            await postProcessExpectingStatus({
                l0_area: 'E2E Claims',
                l1_process: `E2E-PROC-INVALID ${Date.now()}`,
                impact_client: '5',
            }),
        ).toBe(422);
    });

    test('Detail view shows the seeded process with its stable F-code and entered fields', async ({ riskManagerPage }) => {
        const seeded = await getProcessByL1(E2E_PROCESSES.CLAIMS_INTAKE.l1_process);
        expect(seeded).not.toBeNull();
        expect(seeded!.f_code).toMatch(/^F\d+$/);

        await riskManagerPage.goto(`/processes/${seeded!.id}`);
        await waitForDataLoad(riskManagerPage);

        await expect(riskManagerPage.locator('main h1').first()).toContainText(E2E_PROCESSES.CLAIMS_INTAKE.l1_process);
        await expect(riskManagerPage.getByText(seeded!.f_code, { exact: true })).toBeVisible();
        await expect(riskManagerPage.getByText(E2E_PROCESSES.CLAIMS_INTAKE.l0_area).first()).toBeVisible();
        await expect(riskManagerPage.getByText('Jana Horáková', { exact: true })).toBeVisible();
        await expect(riskManagerPage.getByText(/Operations · employee/i)).toBeVisible();
        await expect(riskManagerPage.getByText('ops.analyst@riskhub.local', { exact: true })).toHaveCount(0);
        await expect(riskManagerPage.getByText('Operations (OPS)')).toBeVisible();
        await expect(riskManagerPage.getByText(CRITICALITY_LABELS.high).first()).toBeVisible();
        // Ticket #48: the engine-derived block renders read-only on the detail.
        // E2E-PROC-001 is seeded with impacts 4/3/4/3 and MTPD 24h: score
        // 14 + MTPD bonus 3 (24h <= P_MTPDStr) = 17 -> Kritická (>= 16); the
        // live score wins over the entered preliminary class "Vysoká".
        const derivedSection = riskManagerPage.getByTestId('process-derived-section');
        await expect(derivedSection).toBeVisible();
        await expect(derivedSection.getByTestId('process-derived-score')).toHaveText('17');
        await expect(derivedSection.getByText(CRITICALITY_LABELS.critical)).toBeVisible();
        // CIF Ano: the seeded override "Ano" takes precedence (the Kritická
        // class would trigger it anyway).
        await expect(derivedSection.getByTestId('process-derived-cif')).toHaveText(CIF_YES_LABEL);
    });

    test('Edit round-trip persists entered field changes', async ({ riskManagerPage }) => {
        const created = await createProcessViaApi({
            l0_area: 'E2E Claims',
            l1_process: `E2E-PROC-EDIT ${Date.now()}`,
        });

        await riskManagerPage.goto(`/processes/${created.id}/edit`);
        await waitForDataLoad(riskManagerPage);

        await riskManagerPage.getByTestId('process-form-preliminary-criticality').click();
        await riskManagerPage.getByRole('option', { name: CRITICALITY_LABELS.medium }).click();
        await riskManagerPage.getByTestId('process-form-submit').click();

        await riskManagerPage.waitForURL(new RegExp(`/processes/${created.id}$`));
        // Hard reload: the SPA detail cache holds the pre-edit copy for up to
        // 30s (DETAIL_QUERY_STALE_TIME_MS); a fresh document proves persistence.
        await riskManagerPage.goto(`/processes/${created.id}`);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByText(CRITICALITY_LABELS.medium).first()).toBeVisible();
        // The stable F-code survives the edit untouched.
        await expect(riskManagerPage.getByText(created.f_code, { exact: true })).toBeVisible();
    });

    test('Archive and restore round-trip through the register UI', async ({ riskManagerPage }) => {
        const uniqueName = `E2E-PROC-LC ${Date.now()}`;
        const created = await createProcessViaApi({
            l0_area: 'E2E Legacy',
            l1_process: uniqueName,
        });

        await riskManagerPage.goto(`/processes/${created.id}`);
        await waitForDataLoad(riskManagerPage);
        await riskManagerPage.getByTestId('process-detail-archive').click();
        await riskManagerPage
            .locator('.confirm-dialog-actions')
            .getByRole('button', { name: ARCHIVE_CONFIRM_BUTTON })
            .click();
        await riskManagerPage.waitForURL(/.*processes$/);

        const processesPage = new ProcessesPage(riskManagerPage);
        await processesPage.setStatusFilterArchived();
        await processesPage.search(uniqueName);
        await expect(processesPage.rowByText(uniqueName)).toBeVisible();

        // Hard reload: the SPA detail cache still holds the pre-archive copy
        // for up to 30s (DETAIL_QUERY_STALE_TIME_MS).
        await riskManagerPage.goto(`/processes/${created.id}`);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByTestId('process-detail-restore')).toBeVisible();
        await riskManagerPage.getByTestId('process-detail-restore').click();

        // Restored: archive/edit come back, restore disappears.
        await expect(riskManagerPage.getByTestId('process-detail-archive')).toBeVisible();
        await expect(riskManagerPage.getByTestId('process-detail-restore')).toHaveCount(0);
        // The F-code was never freed or reassigned across the archive cycle.
        await expect(riskManagerPage.getByText(created.f_code, { exact: true })).toBeVisible();
    });
});
