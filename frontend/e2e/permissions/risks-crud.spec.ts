import { test, expect } from '../fixtures/auth.fixture';
import { E2E_RISKS } from '../fixtures/e2e-data';
import { RisksPage } from '../pages/RisksPage';
import { waitForDataLoad, waitForTableRowByText } from '../helpers/wait';

test.describe('Risk CRUD Permissions (Deterministic)', () => {
    test('Risk Manager can see deterministic risk list rows', async ({ riskManagerPage }) => {
        const risksPage = new RisksPage(riskManagerPage);
        await risksPage.navigate();
        await risksPage.search(E2E_RISKS.PENDING_DELETE_APPROVAL.name);

        await expect(risksPage.rowByText(E2E_RISKS.PENDING_DELETE_APPROVAL.name)).toBeVisible();
    });

    test('Employee cannot see New Risk button', async ({ employeePage }) => {
        const risksPage = new RisksPage(employeePage);
        await risksPage.navigate();
        await risksPage.expectCreateButtonHidden();
    });

    test('Risk Manager can open deterministic risk detail', async ({ riskManagerPage }) => {
        const risksPage = new RisksPage(riskManagerPage);
        await risksPage.navigate();
        await risksPage.search(E2E_RISKS.CROSS_DEPT_FIN_OWNS_OPS.name);

        await risksPage.openRowByText(E2E_RISKS.CROSS_DEPT_FIN_OWNS_OPS.name);
        await expect(riskManagerPage).toHaveURL(/\/risks\/\d+$/);
        await expect(riskManagerPage.locator('h1, h2').first()).toBeVisible();
    });

    test('Archived deterministic risk is hidden by default until status is Archived', async ({ riskManagerPage }) => {
        const risksPage = new RisksPage(riskManagerPage);
        await risksPage.navigate();
        await risksPage.search(E2E_RISKS.ARCHIVE_RESTORE_TARGET.name);

        const archivedVisibleWithoutToggle = await waitForTableRowByText(
            riskManagerPage,
            E2E_RISKS.ARCHIVE_RESTORE_TARGET.name,
            2000,
        );
        expect(archivedVisibleWithoutToggle).toBe(false);
    });

    test('Archived deterministic risk appears when status filter is Archived', async ({ riskManagerPage }) => {
        const risksPage = new RisksPage(riskManagerPage);
        await risksPage.navigate();
        await risksPage.setStatusFilterArchived();
        await risksPage.search(E2E_RISKS.ARCHIVE_RESTORE_TARGET.name);

        await expect(risksPage.rowByText(E2E_RISKS.ARCHIVE_RESTORE_TARGET.name)).toBeVisible();
    });

    test('Risk Manager sees unarchive action on archived deterministic risk row', async ({ riskManagerPage }) => {
        const risksPage = new RisksPage(riskManagerPage);
        await risksPage.navigate();
        await risksPage.setStatusFilterArchived();
        await risksPage.search(E2E_RISKS.ARCHIVE_RESTORE_TARGET.name);

        const row = risksPage.rowByText(E2E_RISKS.ARCHIVE_RESTORE_TARGET.name);
        await expect(row).toBeVisible();
        await expect(row.locator('[data-testid^="risk-unarchive-"]').first()).toBeVisible();
    });

    test('Archived risk remains navigable from toggled list', async ({ riskManagerPage }) => {
        const risksPage = new RisksPage(riskManagerPage);
        await risksPage.navigate();
        await risksPage.setStatusFilterArchived();
        await risksPage.search(E2E_RISKS.ARCHIVE_RESTORE_TARGET.name);

        await risksPage.openRowByText(E2E_RISKS.ARCHIVE_RESTORE_TARGET.name);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.locator('h1, h2').first()).toBeVisible();
    });
});
