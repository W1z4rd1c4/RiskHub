import { test, expect, DEMO_ACCOUNTS } from '../fixtures/auth.fixture';
import { E2E_CONTROLS } from '../fixtures/e2e-data';
import { ControlsPage } from '../pages/ControlsPage';
import { loginAsDemoUser } from '../helpers/login';

test.describe('Control Owner Cross-Department Access (Deterministic)', () => {
    test('Operations employee can access IT-department control they own', async ({ employeePage }) => {
        const controlsPage = new ControlsPage(employeePage);
        await controlsPage.navigate();
        await controlsPage.search(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name);

        await expect(controlsPage.rowByText(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name)).toBeVisible();
        await controlsPage.openRowByText(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name);
        await expect(employeePage).toHaveURL(/\/controls\/\d+$/);
    });

    test('IT employee can access Operations-department control they own', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAsDemoUser(page, DEMO_ACCOUNTS.EMPLOYEE_IT);

        const controlsPage = new ControlsPage(page);
        await controlsPage.navigate();
        await controlsPage.search(E2E_CONTROLS.CROSS_DEPT_IT_OWNS_OPS.name);

        await expect(controlsPage.rowByText(E2E_CONTROLS.CROSS_DEPT_IT_OWNS_OPS.name)).toBeVisible();

        await context.close();
    });

    test('Finance department head does not see unrelated cross-department control', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAsDemoUser(page, DEMO_ACCOUNTS.DEPT_HEAD_FINANCE);

        const controlsPage = new ControlsPage(page);
        await controlsPage.navigate();
        await controlsPage.search(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name);

        await expect(controlsPage.rowByText(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name)).toHaveCount(0);

        await context.close();
    });

    test('Control owner detail page renders linked risk information section', async ({ employeePage }) => {
        const controlsPage = new ControlsPage(employeePage);
        await controlsPage.navigate();
        await controlsPage.search(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name);
        await controlsPage.openRowByText(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name);
        await expect(employeePage.getByRole('heading', { name: E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name })).toBeVisible();

        const bodyText = await employeePage.textContent('main');
        expect(bodyText?.toLowerCase()).toContain('risk');
    });
});
