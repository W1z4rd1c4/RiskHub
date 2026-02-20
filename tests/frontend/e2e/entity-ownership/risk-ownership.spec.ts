import { test, expect, DEMO_ACCOUNTS } from '../fixtures/auth.fixture';
import { E2E_RISKS } from '../fixtures/e2e-data';
import { RisksPage } from '../pages/RisksPage';
import { loginAsDemoUser } from '../helpers/login';

test.describe('Risk Ownership (Deterministic)', () => {
    test('Finance department head can view their cross-department owned risk', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAsDemoUser(page, DEMO_ACCOUNTS.DEPT_HEAD_FINANCE);

        const risksPage = new RisksPage(page);
        await risksPage.navigate();
        await risksPage.search(E2E_RISKS.CROSS_DEPT_FIN_OWNS_OPS.name);

        await risksPage.openRowByText(E2E_RISKS.CROSS_DEPT_FIN_OWNS_OPS.name);
        await expect(page).toHaveURL(/\/risks\/\d+$/);

        await context.close();
    });

    test('IT department head can view their cross-department owned risk', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAsDemoUser(page, DEMO_ACCOUNTS.DEPT_HEAD_IT);

        const risksPage = new RisksPage(page);
        await risksPage.navigate();
        await risksPage.search(E2E_RISKS.CROSS_DEPT_IT_OWNS_FIN.name);
        await risksPage.openRowByText(E2E_RISKS.CROSS_DEPT_IT_OWNS_FIN.name);
        await expect(page).toHaveURL(/\/risks\/\d+$/);

        await context.close();
    });

    test('Unrelated employee cannot see finance-owned cross-department risk', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAsDemoUser(page, DEMO_ACCOUNTS.EMPLOYEE_IT);

        const risksPage = new RisksPage(page);
        await risksPage.navigate();
        await risksPage.search(E2E_RISKS.CROSS_DEPT_IT_OWNS_FIN.name);

        await expect(risksPage.rowByText(E2E_RISKS.CROSS_DEPT_IT_OWNS_FIN.name)).toHaveCount(0);

        await context.close();
    });
});
