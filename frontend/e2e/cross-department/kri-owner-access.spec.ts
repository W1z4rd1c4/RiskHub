/**
 * KRI Reporting Owner Cross-Department Access E2E Tests (Deterministic)
 * Uses seeded fixtures to avoid first-row and content-shell flakiness.
 */
import { test, expect, DEMO_ACCOUNTS } from '../fixtures/auth.fixture';
import { E2E_KRIS, E2E_RISKS } from '../fixtures/e2e-data';
import { KRIsPage } from '../pages/KRIsPage';
import { waitForDataLoad } from '../helpers/wait';
import { loginAsDemoUser } from '../helpers/login';
import type { Browser } from '@playwright/test';

async function openDeterministicCrossDeptKriForFinanceOwner(browser: Browser) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsDemoUser(page, DEMO_ACCOUNTS.EMPLOYEE_FINANCE);

    const krisPage = new KRIsPage(page);
    await krisPage.navigate();
    await krisPage.search(E2E_KRIS.CROSS_DEPT_FIN_REPORTS_IT.metric_name);
    await krisPage.openRowByText(E2E_KRIS.CROSS_DEPT_FIN_REPORTS_IT.metric_name);
    await expect(page).toHaveURL(/\/kris\/\d+$/);
    await expect(page.locator('h1').first()).toBeVisible();

    return { context, page };
}

test.describe('KRI Reporting Owner Cross-Department Access (Deterministic)', () => {
    test('Reporting owner can open deterministic cross-department KRI from list', async ({ browser }) => {
        const { context, page } = await openDeterministicCrossDeptKriForFinanceOwner(browser);
        await expect(page.locator('h1').first()).toContainText(E2E_KRIS.CROSS_DEPT_FIN_REPORTS_IT.metric_name);
        await context.close();
    });

    test('KRI detail shows linked risk section for deterministic cross-department KRI', async ({ browser }) => {
        const { context, page } = await openDeterministicCrossDeptKriForFinanceOwner(browser);
        await expect(page.locator('h3:has-text("Linked Risk")')).toBeVisible();
        await expect(page.locator('h4').filter({ hasText: E2E_RISKS.PRIORITY_PRIVILEGED_APPROVAL.name }).first()).toBeVisible();
        await context.close();
    });

    test('Clicking linked risk card navigates to risk detail and shows controls surface', async ({ browser }) => {
        const { context, page } = await openDeterministicCrossDeptKriForFinanceOwner(browser);

        const linkedRiskHeading = page.locator('h4').filter({ hasText: E2E_RISKS.PRIORITY_PRIVILEGED_APPROVAL.name }).first();
        await expect(linkedRiskHeading).toBeVisible();
        await linkedRiskHeading.click();

        await expect(page).toHaveURL(/\/risks\/\d+$/);
        await expect(page.locator('h1, h2').first()).toBeVisible();
        await expect(page.locator('h3').filter({ hasText: /Mitigating Controls/i }).first()).toBeVisible();
        await context.close();
    });

    test('Reporting owner can see Record Value action on deterministic KRI detail', async ({ browser }) => {
        const { context, page } = await openDeterministicCrossDeptKriForFinanceOwner(browser);
        await expect(page.getByRole('button', { name: /Record Value/i })).toBeVisible();
        await context.close();
    });

    test('Non-owner does not see deterministic cross-department KRI in list', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAsDemoUser(page, DEMO_ACCOUNTS.EMPLOYEE_OPERATIONS);

        const krisPage = new KRIsPage(page);
        await krisPage.navigate();
        await krisPage.search(E2E_KRIS.CROSS_DEPT_FIN_REPORTS_IT.metric_name);

        const listItem = page
            .locator('table tbody tr, [class*="card"], [class*="Card"]')
            .filter({ hasText: E2E_KRIS.CROSS_DEPT_FIN_REPORTS_IT.metric_name })
            .first();
        const visible = await listItem.isVisible().catch(() => false);
        expect(visible).toBe(false);

        await context.close();
    });

    test('Non-owner direct URL access to deterministic cross-department KRI is denied', async ({ browser }) => {
        const owner = await openDeterministicCrossDeptKriForFinanceOwner(browser);
        const kriId = owner.page.url().split('/').pop();
        await owner.context.close();

        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAsDemoUser(page, DEMO_ACCOUNTS.EMPLOYEE_OPERATIONS);

        const response = await page.goto(`/kris/${kriId}`, { waitUntil: 'networkidle' });
        await waitForDataLoad(page);

        const url = page.url();
        const bodyText = (await page.textContent('body')) ?? '';
        const denied =
            (!!response && (response.status() === 403 || response.status() === 404)) ||
            !url.includes(`/kris/${kriId}`) ||
            /not found|does not exist|error|403|404|access denied|forbidden/i.test(bodyText);

        expect(denied).toBe(true);
        await context.close();
    });
});
