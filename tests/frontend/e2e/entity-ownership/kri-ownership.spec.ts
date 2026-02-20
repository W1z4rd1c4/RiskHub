import { test, expect, DEMO_ACCOUNTS } from '../fixtures/auth.fixture';
import { E2E_KRIS } from '../fixtures/e2e-data';
import { KRIsPage } from '../pages/KRIsPage';
import { loginAsDemoUser } from '../helpers/login';

test.describe('KRI Ownership & Inheritance (Deterministic)', () => {
    test('Finance employee can view cross-department reporting-owner KRI', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAsDemoUser(page, DEMO_ACCOUNTS.EMPLOYEE_FINANCE);

        const krisPage = new KRIsPage(page);
        await krisPage.navigate();
        await krisPage.search(E2E_KRIS.CROSS_DEPT_FIN_REPORTS_IT.metric_name);

        const row = krisPage.rowByText(E2E_KRIS.CROSS_DEPT_FIN_REPORTS_IT.metric_name);
        await expect(row).toBeVisible();
        await krisPage.openRowByText(E2E_KRIS.CROSS_DEPT_FIN_REPORTS_IT.metric_name);
        await expect(page).toHaveURL(/\/kris\/\d+$/);

        await context.close();
    });

    test('Archived KRI appears for Risk Manager only when status filter is Archived', async ({ riskManagerPage }) => {
        const krisPage = new KRIsPage(riskManagerPage);
        await krisPage.navigate();
        await krisPage.search(E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name);
        await expect(krisPage.rowByText(E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name)).toHaveCount(0);

        await krisPage.setStatusFilterArchived();
        await krisPage.search(E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name);
        await expect(krisPage.rowByText(E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name)).toBeVisible();
    });

    test('Operations employee cannot see unrelated finance-reported KRI', async ({ employeePage }) => {
        const krisPage = new KRIsPage(employeePage);
        await krisPage.navigate();
        await krisPage.search(E2E_KRIS.CROSS_DEPT_FIN_REPORTS_IT.metric_name);

        await expect(krisPage.rowByText(E2E_KRIS.CROSS_DEPT_FIN_REPORTS_IT.metric_name)).toHaveCount(0);
    });
});
