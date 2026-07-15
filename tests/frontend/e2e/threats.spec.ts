/**
 * ICT Register — Threat register + ICT-risk integration E2E (issue #47,
 * deterministic fixtures).
 *
 * Asserts CURRENT behavior: the Threat register (12_Hrozby entered columns,
 * category on the verbatim KategorieHrozeb closed list) with the standard
 * role split — risk manager maintains, the employee reads, the platform
 * admin is excluded from the navigation entirely; archive/restore through
 * the detail actions; the Threat<->Risk Link relation managed from the
 * Threat page; the Risk detail's register-links blocks (Threats, Processes,
 * Assets — seeded onto E2E-RISK-001); and the strictly additive risk
 * acceptance-governance fields round-tripping through the risk form's
 * scoring step.
 */
import { test, expect } from './fixtures/auth.fixture';
import { E2E_ICT_REGISTER_RISK, E2E_THREATS } from './fixtures/e2e-data';
import {
    createThreatViaApi,
    getRiskByCode,
    getRiskViaApi,
    getThreatByName,
    listThreatRiskLinks,
} from './helpers/ict-register';
import { waitForDataLoad } from './helpers/wait';

// KategorieHrozeb, verbatim workbook closed list (spec section 3.1).
const KATEGORIE_HROZEB = [
    'Dostupnost',
    'Integrita',
    'Důvěrnost',
    'Hodnověrnost',
    'Fyzická',
    'Personální',
    'Třetí strany',
];

const ARCHIVE_CONFIRM_BUTTON = /^(Archive|Archivovat)$/;

async function requireThreat(name: string): Promise<{ id: number }> {
    const threat = await getThreatByName(name);
    if (!threat) {
        throw new Error(`Threat '${name}' not found — run the deterministic E2E seed first.`);
    }
    return threat;
}

async function requireIctRisk(): Promise<{ id: number; name: string }> {
    const risk = await getRiskByCode(E2E_ICT_REGISTER_RISK.code);
    if (!risk) {
        throw new Error(
            `Risk '${E2E_ICT_REGISTER_RISK.code}' not found — run the deterministic E2E seed first.`,
        );
    }
    return risk;
}

test.describe('ICT Register — Threats (Deterministic)', () => {
    test('Risk manager sees Threats in the sidebar and navigates to the register', async ({ riskManagerPage }) => {
        await riskManagerPage.goto('/');
        const navLink = riskManagerPage.locator('nav a[href="/threats"]');
        await expect(navLink).toBeVisible();

        await navLink.click();
        await riskManagerPage.waitForURL(/.*threats$/);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByTestId('threats-search-input')).toBeVisible();
        await expect(riskManagerPage.getByTestId('threats-create-button')).toBeVisible();
    });

    test('Platform admin does not see Threats navigation', async ({ adminPage }) => {
        // Anchor on the admin-only console link before asserting the absence.
        await expect(adminPage.locator('a[href="/admin"]').first()).toBeVisible();
        await expect(adminPage.locator('a[href="/threats"]')).toHaveCount(0);
    });

    test('Register lists the seeded deterministic threats with verbatim categories', async ({ riskManagerPage }) => {
        await riskManagerPage.goto('/threats');
        await waitForDataLoad(riskManagerPage);
        await riskManagerPage.getByTestId('threats-search-input').fill('E2E-THREAT');
        await waitForDataLoad(riskManagerPage);

        const ransomwareRow = riskManagerPage
            .locator('tbody tr')
            .filter({ hasText: E2E_THREATS.RANSOMWARE.name })
            .first();
        await expect(ransomwareRow).toBeVisible();
        await expect(
            ransomwareRow.getByText(E2E_THREATS.RANSOMWARE.category, { exact: true }),
        ).toBeVisible();

        const leakRow = riskManagerPage
            .locator('tbody tr')
            .filter({ hasText: E2E_THREATS.THIRD_PARTY_LEAK.name })
            .first();
        await expect(leakRow).toBeVisible();
        await expect(
            leakRow.getByText(E2E_THREATS.THIRD_PARTY_LEAK.category, { exact: true }),
        ).toBeVisible();
    });

    test('Create a threat via the form with the verbatim KategorieHrozeb dropdown', async ({ riskManagerPage }) => {
        const uniqueName = `E2E-THREAT-UI ${Date.now()}`;

        await riskManagerPage.goto('/threats/new');
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByTestId('threat-form-name')).toBeVisible();

        await riskManagerPage.getByTestId('threat-form-name').fill(uniqueName);

        // The category dropdown carries the KategorieHrozeb closed list
        // verbatim, in order, plus the leading "Not set" empty entry.
        await riskManagerPage.getByTestId('threat-form-category').click();
        await expect(riskManagerPage.getByRole('option')).toHaveCount(KATEGORIE_HROZEB.length + 1);
        const optionTexts = await riskManagerPage.getByRole('option').allTextContents();
        expect(optionTexts.slice(1)).toEqual(KATEGORIE_HROZEB);
        await riskManagerPage.getByRole('option', { name: 'Fyzická', exact: true }).click();

        await riskManagerPage
            .getByTestId('threat-form-description')
            .fill('Deterministic UI-created threat.');
        await riskManagerPage.getByTestId('threat-form-submit').click();

        await riskManagerPage.waitForURL(/\/threats\/\d+$/);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.locator('main h1').first()).toContainText(uniqueName);
        await expect(riskManagerPage.getByTestId('threat-detail-category')).toHaveText('Fyzická');
    });

    test('Edit round-trip persists entered field changes', async ({ riskManagerPage }) => {
        const created = await createThreatViaApi({
            name: `E2E-THREAT-EDIT ${Date.now()}`,
            category: 'Integrita',
        });

        await riskManagerPage.goto(`/threats/${created.id}/edit`);
        await waitForDataLoad(riskManagerPage);

        await riskManagerPage.getByTestId('threat-form-relevant-subject').fill('E2E Edited Subject');
        await riskManagerPage.getByTestId('threat-form-category').click();
        await riskManagerPage.getByRole('option', { name: 'Personální', exact: true }).click();
        await riskManagerPage.getByTestId('threat-form-submit').click();

        await riskManagerPage.waitForURL(new RegExp(`/threats/${created.id}$`));
        // Fresh document proves persistence beyond any client-side state.
        await riskManagerPage.goto(`/threats/${created.id}`);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByTestId('threat-detail-category')).toHaveText('Personální');
        await expect(riskManagerPage.getByText('E2E Edited Subject').first()).toBeVisible();
    });

    test('Archive and restore round-trip through the detail actions', async ({ riskManagerPage }) => {
        const created = await createThreatViaApi({
            name: `E2E-THREAT-LC ${Date.now()}`,
            category: 'Důvěrnost',
        });

        await riskManagerPage.goto(`/threats/${created.id}`);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByTestId('threat-detail-archive')).toBeVisible();

        // Archive: confirm dialog, then the detail navigates back to /threats.
        await riskManagerPage.getByTestId('threat-detail-archive').click();
        await riskManagerPage
            .locator('.confirm-dialog-actions')
            .getByRole('button', { name: ARCHIVE_CONFIRM_BUTTON })
            .click();
        await riskManagerPage.waitForURL(/.*threats$/);

        // The archived detail swaps its actions to restore-only.
        await riskManagerPage.goto(`/threats/${created.id}`);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByTestId('threat-detail-restore')).toBeVisible();
        await expect(riskManagerPage.getByTestId('threat-detail-archive')).toHaveCount(0);
        await expect(riskManagerPage.getByTestId('threat-detail-edit')).toHaveCount(0);

        // Restore: edit and archive come back, restore disappears.
        await riskManagerPage.getByTestId('threat-detail-restore').click();
        await expect(riskManagerPage.getByTestId('threat-detail-archive')).toBeVisible();
        await expect(riskManagerPage.getByTestId('threat-detail-edit')).toBeVisible();
        await expect(riskManagerPage.getByTestId('threat-detail-restore')).toHaveCount(0);
    });

    test('Threat-Risk link add and remove from the threat page', async ({ riskManagerPage }) => {
        const risk = await requireIctRisk();
        // A dedicated threat keeps the seeded E2E-THREAT-001 link untouched.
        const created = await createThreatViaApi({
            name: `E2E-THREAT-LINK ${Date.now()}`,
            category: 'Hodnověrnost',
        });
        const riskOptionLabel = `${E2E_ICT_REGISTER_RISK.code}: ${risk.name}`;

        await riskManagerPage.goto(`/threats/${created.id}`);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByTestId('threat-risk-links-section')).toBeVisible();

        // Narrow through the public server-backed search seam before opening
        // the portalled select. This is the real large-register path and avoids
        // a Firefox/Radix scroll race when the target sits deep in a long list.
        await riskManagerPage.getByTestId('threat-risk-link-select-search').fill(E2E_ICT_REGISTER_RISK.code);
        await riskManagerPage.getByTestId('threat-risk-link-select').click();
        await riskManagerPage.getByRole('option', { name: riskOptionLabel, exact: true }).click();
        const addLinkButton = riskManagerPage.getByTestId('threat-risk-link-add');
        await expect(addLinkButton).toBeEnabled();
        await addLinkButton.click();

        const riskLinks = riskManagerPage.getByTestId('threat-risk-links');
        await expect(riskLinks.getByText(riskOptionLabel, { exact: true })).toBeVisible();

        // The linked risk leaves the add dropdown (unique pair).
        await riskManagerPage.getByTestId('threat-risk-link-select').click();
        await expect(
            riskManagerPage.getByRole('option', { name: riskOptionLabel, exact: true }),
        ).toHaveCount(0);
        await riskManagerPage.keyboard.press('Escape');

        const link = (await listThreatRiskLinks(created.id)).find((row) => row.risk_id === risk.id);
        expect(link).toBeDefined();
        await riskManagerPage.getByTestId(`threat-risk-link-remove-${link!.id}`).click();
        await expect(riskManagerPage.getByTestId(`threat-risk-link-remove-${link!.id}`)).toHaveCount(0);
        const remaining = await listThreatRiskLinks(created.id);
        expect(remaining.some((row) => row.risk_id === risk.id)).toBe(false);
    });

    test('Risk detail renders the seeded register-links blocks', async ({ riskManagerPage }) => {
        const risk = await requireIctRisk();

        await riskManagerPage.goto(`/risks/${risk.id}`);
        await waitForDataLoad(riskManagerPage);

        const section = riskManagerPage.getByTestId('risk-register-links-section');
        await expect(section).toBeVisible();

        // Threats block: the seeded E2E-THREAT-001 link.
        await expect(
            riskManagerPage
                .getByTestId('risk-threat-link-rows')
                .getByText(E2E_THREATS.RANSOMWARE.name, { exact: true }),
        ).toBeVisible();
        // Processes block: the seeded E2E-PROC-003 link. The row renders the
        // full workbook process display name (l1 + " – " + l2 subprocess
        // "Solvency II bordereaux"), so match the l1 prefix without exact:true.
        await expect(
            riskManagerPage
                .getByTestId('risk-process-link-rows')
                .getByText('E2E-PROC-003 Regulatory Reporting', { exact: false }),
        ).toBeVisible();
        // Assets block: the seeded E2E-ASSET-002 link.
        await expect(
            riskManagerPage
                .getByTestId('risk-asset-link-rows')
                .getByText('E2E-ASSET-002 Claims Database', { exact: true }),
        ).toBeVisible();
    });

    test('Acceptance fields round-trip on the risk form scoring step', async ({ riskManagerPage }) => {
        const risk = await requireIctRisk();
        const uniqueApprover = `E2E Acceptance Approver ${Date.now()}`;

        await riskManagerPage.goto(`/risks/${risk.id}/edit`);
        await waitForDataLoad(riskManagerPage);

        // The acceptance block sits on the scoring step (step 3 of the wizard).
        await riskManagerPage.getByTestId('risk-form-next-button').click();
        await riskManagerPage.getByTestId('risk-form-next-button').click();
        await expect(riskManagerPage.getByTestId('risk-acceptance-section')).toBeVisible();

        await riskManagerPage.getByTestId('risk-acceptance-approver').fill(uniqueApprover);
        await riskManagerPage.getByTestId('risk-acceptance-date').fill('2026-07-01');
        await riskManagerPage
            .getByTestId('risk-acceptance-justification')
            .fill('E2E acceptance justification (round-trip).');
        await riskManagerPage.getByTestId('risk-form-submit-button').click();
        await riskManagerPage.waitForURL(new RegExp(`/risks/${risk.id}$`));

        // Persistence proof at the API seam (risk manager updates apply
        // directly — no approval detour on the acceptance fields).
        const persisted = await getRiskViaApi(risk.id);
        expect(persisted.acceptance_approver).toBe(uniqueApprover);
        expect(persisted.acceptance_date).toBe('2026-07-01');
        expect(persisted.acceptance_justification).toBe('E2E acceptance justification (round-trip).');

        // The form re-opens with the persisted values (ISO date input value).
        await riskManagerPage.goto(`/risks/${risk.id}/edit`);
        await waitForDataLoad(riskManagerPage);
        await riskManagerPage.getByTestId('risk-form-next-button').click();
        await riskManagerPage.getByTestId('risk-form-next-button').click();
        await expect(riskManagerPage.getByTestId('risk-acceptance-approver')).toHaveValue(uniqueApprover);
        await expect(riskManagerPage.getByTestId('risk-acceptance-date')).toHaveValue('2026-07-01');
    });

    test('Employee sees the register read-only: no create, edit, archive, or link management', async ({ employeePage }) => {
        const seeded = await requireThreat(E2E_THREATS.RANSOMWARE.name);

        await employeePage.goto('/');
        await expect(employeePage.locator('nav a[href="/threats"]')).toBeVisible();

        await employeePage.goto('/threats');
        await waitForDataLoad(employeePage);
        await employeePage.getByTestId('threats-search-input').fill(E2E_THREATS.RANSOMWARE.name);
        await waitForDataLoad(employeePage);
        await expect(
            employeePage.locator('tbody tr').filter({ hasText: E2E_THREATS.RANSOMWARE.name }).first(),
        ).toBeVisible();
        await expect(employeePage.getByTestId('threats-create-button')).toHaveCount(0);

        // Detail: read-only actions. The section renders, but the threat's only
        // seeded risk link targets E2E-RISK-001 (Risk Management); an Operations
        // employee cannot see cross-department risks, so visibility scoping (F2)
        // hides the link rows entirely — with no manage affordances either.
        await employeePage.goto(`/threats/${seeded.id}`);
        await waitForDataLoad(employeePage);
        await expect(employeePage.locator('main h1').first()).toContainText(E2E_THREATS.RANSOMWARE.name);
        await expect(employeePage.getByTestId('threat-detail-edit')).toHaveCount(0);
        await expect(employeePage.getByTestId('threat-detail-archive')).toHaveCount(0);
        await expect(employeePage.getByTestId('threat-risk-links-section')).toBeVisible();
        await expect(employeePage.getByTestId('threat-risk-links')).toHaveCount(0);
        await expect(employeePage.getByTestId('threat-risk-link-add')).toHaveCount(0);
        await expect(employeePage.locator('[data-testid^="threat-risk-link-remove-"]')).toHaveCount(0);
    });
});
