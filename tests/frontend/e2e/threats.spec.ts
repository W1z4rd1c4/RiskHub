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
import { getApiBaseUrl, getDemoToken } from './helpers/api-auth';
import {
    createThreatViaApi,
    getRiskByCode,
    getRiskViaApi,
    getThreatByName,
    listThreatRiskLinks,
} from './helpers/ict-register';
import { waitForDataLoad } from './helpers/wait';
import { ApprovalsPage } from './pages/ApprovalsPage';

// Canonical storage codes are rendered as localized English labels.
const THREAT_CATEGORY_LABELS = [
    'Availability',
    'Integrity',
    'Confidentiality',
    'Authenticity',
    'Physical',
    'Personnel',
    'Third party',
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

async function ensureBackupCiso(): Promise<{ id: number; email: string; name: string }> {
    const email = 'e2e.backup-ciso@example.com';
    const token = await getDemoToken({ email: 'admin@riskhub.local', fallbackUserIds: [1] });
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const usersResponse = await fetch(`${getApiBaseUrl()}/api/v1/users?limit=100`, { headers });
    const users = await usersResponse.json() as Array<{
        id: number;
        email: string;
        name: string;
        is_active: boolean;
        role: { id: number; name: string };
        department_id: number | null;
    }>;
    const existing = users.find((user) => user.email === email);
    if (existing) {
        if (!existing.is_active) {
            await fetch(`${getApiBaseUrl()}/api/v1/users/${existing.id}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ is_active: true }),
            });
        }
        return existing;
    }
    const template = users.find((user) => user.role.name === 'ciso');
    if (!template) throw new Error('CISO template user was not found');
    const createdResponse = await fetch(`${getApiBaseUrl()}/api/v1/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            email,
            name: 'E2E Backup CISO',
            password: `E2E-${crypto.randomUUID()}-Aa1!`,
            role_id: template.role.id,
            department_id: template.department_id,
            is_active: true,
        }),
    });
    if (!createdResponse.ok) {
        throw new Error(`Backup CISO creation failed: ${createdResponse.status}`);
    }
    return await createdResponse.json() as { id: number; email: string; name: string };
}

test.describe('ICT Register — Threats (Deterministic)', () => {
    test('CISO stewardship change queues in My Requests and applies only after independent approval', async ({
        cisoPage,
        riskManagerPage,
    }) => {
        const risk = await requireIctRisk();
        const riskOptionLabel = `${E2E_ICT_REGISTER_RISK.code}: ${risk.name}`;

        await cisoPage.goto('/threats/new');
        await waitForDataLoad(cisoPage);
        await expect(cisoPage.getByTestId('threat-form-name')).toBeVisible();
        await expect(cisoPage.locator('nav a[href="/users"]')).toHaveCount(0);
        await expect(cisoPage.locator('nav a[href="/approvals"]')).toBeVisible();

        const uniqueName = `E2E-CISO-THREAT ${Date.now()}`;
        await cisoPage.getByTestId('threat-form-name').fill(uniqueName);
        await cisoPage.getByTestId('threat-form-steward-search').fill('Klára');
        await cisoPage.getByTestId('threat-form-steward').click();
        await cisoPage.getByRole('option', { name: /Klára Černá/ }).click();
        await cisoPage.getByTestId('threat-form-submit').click();

        await cisoPage.waitForURL(/\/threats\/\d+$/);
        await expect(cisoPage.getByTestId('threat-detail-steward')).toContainText('Klára Černá');

        const createdId = Number(cisoPage.url().match(/\/threats\/(\d+)$/)?.[1]);
        expect(createdId).toBeGreaterThan(0);

        // CISO owns the full Threat lifecycle, not creation alone.
        await cisoPage.getByTestId('threat-detail-edit').click();
        await cisoPage.waitForURL(new RegExp(`/threats/${createdId}/edit$`));
        await cisoPage.getByTestId('threat-form-relevant-subject').fill('CISO-owned ICT service');
        await cisoPage.getByTestId('threat-form-category').click();
        await cisoPage.getByRole('option', { name: 'Integrity', exact: true }).click();
        await cisoPage.getByTestId('threat-form-submit').click();
        await cisoPage.waitForURL(new RegExp(`/threats/${createdId}$`));
        await expect(cisoPage.getByTestId('threat-detail-category')).toHaveText('Integrity');
        await expect(cisoPage.getByText('CISO-owned ICT service').first()).toBeVisible();

        const backupCiso = await ensureBackupCiso();
        const reason = `Transfer Threat stewardship ${uniqueName}`;
        await cisoPage.getByTestId('threat-detail-edit').click();
        await cisoPage.getByTestId('threat-form-steward-search').fill(backupCiso.email);
        await cisoPage.getByTestId('threat-form-steward').click();
        await cisoPage.getByRole('option', { name: new RegExp(backupCiso.name) }).click();
        await cisoPage.getByTestId('threat-form-submit').click();
        await expect(cisoPage.getByTestId('threat-form-request-reason'))
            .toHaveAttribute('aria-invalid', 'true');
        await cisoPage.getByTestId('threat-form-request-reason').fill(reason);
        const queued = cisoPage.waitForResponse((response) => (
            response.request().method() === 'PATCH'
            && new URL(response.url()).pathname === `/api/v1/threats/${createdId}`
        ));
        await cisoPage.getByTestId('threat-form-submit').click();
        expect((await queued).status()).toBe(202);

        const requesterApprovals = new ApprovalsPage(cisoPage);
        await requesterApprovals.navigate();
        await requesterApprovals.selectMyRequests();
        await expect(requesterApprovals.approvalCards.filter({ hasText: reason })).toHaveCount(1);
        expect((await getThreatByName(uniqueName))!.threat_steward_user_id).not.toBe(backupCiso.id);

        const resolverApprovals = new ApprovalsPage(riskManagerPage);
        await resolverApprovals.navigate();
        const requestIndex = await resolverApprovals.findCardByReason(reason);
        await resolverApprovals.clickApprove(requestIndex);
        await resolverApprovals.submitResolution(`Approve ${reason}`, 'approve');
        await expect.poll(async () => (
            await getThreatByName(uniqueName)
        )?.threat_steward_user_id).toBe(backupCiso.id);

        await cisoPage.goto(`/threats/${createdId}`);
        await waitForDataLoad(cisoPage);
        await expect(cisoPage.getByTestId('threat-detail-steward')).toContainText(backupCiso.name);

        // CISO can maintain the Threat-Risk relation.
        await cisoPage.getByTestId('threat-risk-link-select-search').fill(E2E_ICT_REGISTER_RISK.code);
        await cisoPage.getByTestId('threat-risk-link-select').click();
        await cisoPage.getByRole('option', { name: riskOptionLabel, exact: true }).click();
        await cisoPage.getByTestId('threat-risk-link-add').click();
        await expect(
            cisoPage.getByTestId('threat-risk-links').getByText(riskOptionLabel, { exact: true }),
        ).toBeVisible();

        const link = (await listThreatRiskLinks(createdId)).find((row) => row.risk_id === risk.id);
        expect(link).toBeDefined();
        await cisoPage.getByTestId(`threat-risk-link-remove-${link!.id}`).click();
        await expect(cisoPage.getByTestId(`threat-risk-link-remove-${link!.id}`)).toHaveCount(0);

        // Archive/restore proves the delete permission is scoped to Threats.
        await cisoPage.getByTestId('threat-detail-archive').click();
        await cisoPage
            .locator('.confirm-dialog-actions')
            .getByRole('button', { name: ARCHIVE_CONFIRM_BUTTON })
            .click();
        await cisoPage.waitForURL(/.*threats$/);
        await cisoPage.goto(`/threats/${createdId}`);
        await waitForDataLoad(cisoPage);
        await cisoPage.getByTestId('threat-detail-restore').click();
        await expect(cisoPage.getByTestId('threat-detail-archive')).toBeVisible();
        await expect(cisoPage.getByTestId('threat-detail-edit')).toBeVisible();
    });

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

    test('orphaned stewardship cannot be reassigned through the ordinary CISO edit form', async ({ cisoPage }) => {
        const seeded = await requireThreat(E2E_THREATS.RANSOMWARE.name);

        await cisoPage.route(`**/api/v1/threats/${seeded.id}`, async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue();
                return;
            }
            const response = await route.fetch();
            const payload = await response.json();
            await route.fulfill({
                response,
                json: {
                    ...payload,
                    steward_orphaned: true,
                    stewardship_status: 'pending_governance',
                    capabilities: { ...payload.capabilities, can_update: false },
                },
            });
        });

        await cisoPage.goto(`/threats/${seeded.id}`);
        await waitForDataLoad(cisoPage);
        await expect(cisoPage.getByRole('alert')).toContainText('Ask a CRO');
        await expect(cisoPage.getByTestId('threat-detail-edit')).toHaveCount(0);
        await expect(cisoPage.getByTestId('threat-orphan-governance')).toHaveCount(0);

        await cisoPage.goto(`/threats/${seeded.id}/edit`);
        await waitForDataLoad(cisoPage);
        await expect(cisoPage.getByTestId('threat-orphan-edit-blocked')).toContainText('Ask a CRO');
        await expect(cisoPage.getByTestId('threat-form-steward')).toHaveCount(0);
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

        await riskManagerPage.getByTestId('threat-form-steward-search').fill('Klára');
        await riskManagerPage.getByTestId('threat-form-steward').click();
        await riskManagerPage.getByRole('option', { name: /Klára Černá/ }).click();

        // The dropdown localizes canonical category codes and keeps the
        // leading "Not set" empty entry.
        await riskManagerPage.getByTestId('threat-form-category').click();
        await expect(riskManagerPage.getByRole('option')).toHaveCount(THREAT_CATEGORY_LABELS.length + 1);
        const optionTexts = await riskManagerPage.getByRole('option').allTextContents();
        expect(optionTexts.slice(1)).toEqual(THREAT_CATEGORY_LABELS);
        await riskManagerPage.getByRole('option', { name: 'Physical', exact: true }).click();

        await riskManagerPage
            .getByTestId('threat-form-description')
            .fill('Deterministic UI-created threat.');
        await riskManagerPage.getByTestId('threat-form-submit').click();

        await riskManagerPage.waitForURL(/\/threats\/\d+$/);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.locator('main h1').first()).toContainText(uniqueName);
        await expect(riskManagerPage.getByTestId('threat-detail-category')).toHaveText('Physical');
    });

    test('Edit round-trip persists entered field changes', async ({ riskManagerPage }) => {
        const created = await createThreatViaApi({
            name: `E2E-THREAT-EDIT ${Date.now()}`,
            category: 'integrity',
        });

        await riskManagerPage.goto(`/threats/${created.id}/edit`);
        await waitForDataLoad(riskManagerPage);

        await riskManagerPage.getByTestId('threat-form-relevant-subject').fill('E2E Edited Subject');
        await riskManagerPage.getByTestId('threat-form-category').click();
        await riskManagerPage.getByRole('option', { name: 'Personnel', exact: true }).click();
        await riskManagerPage.getByTestId('threat-form-submit').click();

        await riskManagerPage.waitForURL(new RegExp(`/threats/${created.id}$`));
        // Fresh document proves persistence beyond any client-side state.
        await riskManagerPage.goto(`/threats/${created.id}`);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByTestId('threat-detail-category')).toHaveText('Personnel');
        await expect(riskManagerPage.getByText('E2E Edited Subject').first()).toBeVisible();
    });

    test('Archive and restore round-trip through the detail actions', async ({ riskManagerPage }) => {
        const created = await createThreatViaApi({
            name: `E2E-THREAT-LC ${Date.now()}`,
            category: 'confidentiality',
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
            category: 'authenticity',
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
