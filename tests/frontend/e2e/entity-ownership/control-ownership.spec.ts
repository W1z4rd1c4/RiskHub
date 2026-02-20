import { test, expect, DEMO_ACCOUNTS } from '../fixtures/auth.fixture';
import { E2E_CONTROLS } from '../fixtures/e2e-data';
import { ControlsPage } from '../pages/ControlsPage';
import { loginAsDemoUser } from '../helpers/login';

test.describe('Control Ownership (Deterministic)', () => {
    test('Operations employee can view their cross-department owned control', async ({ employeePage }) => {
        const controlsPage = new ControlsPage(employeePage);
        await controlsPage.navigate();
        await controlsPage.search(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name);

        const row = controlsPage.rowByText(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name);
        await expect(row).toBeVisible();
        await controlsPage.openRowByText(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name);
        await expect(employeePage).toHaveURL(/\/controls\/\d+$/);
    });

    test('IT employee can view their cross-department owned control', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAsDemoUser(page, DEMO_ACCOUNTS.EMPLOYEE_IT);

        const controlsPage = new ControlsPage(page);
        await controlsPage.navigate();
        await controlsPage.search(E2E_CONTROLS.CROSS_DEPT_IT_OWNS_OPS.name);

        await expect(controlsPage.rowByText(E2E_CONTROLS.CROSS_DEPT_IT_OWNS_OPS.name)).toBeVisible();

        await context.close();
    });

    test('Finance department head cannot see unrelated cross-department control', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAsDemoUser(page, DEMO_ACCOUNTS.DEPT_HEAD_FINANCE);

        const controlsPage = new ControlsPage(page);
        await controlsPage.navigate();
        await controlsPage.search(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name);

        await expect(controlsPage.rowByText(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name)).toHaveCount(0);

        await context.close();
    });
});
