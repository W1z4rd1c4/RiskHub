import { test, expect } from '@playwright/test';
import { DEMO_ACCOUNTS, loginAsDemoUser, logout } from './helpers/login';

test.describe('questionnaire workflow', () => {
    test('CRO sends, owner submits, CRO notified', async ({ page }) => {
        const riskName = `E2E Questionnaire Risk ${Date.now()}`;

        // 1) CRO creates a risk and sends questionnaire
        await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO);
        await page.goto('/risks');

        await page.getByRole('button', { name: /New Risk/i }).click();

        // Step 1
        await page.getByPlaceholder('Enter a short, descriptive name for this risk...').fill(riskName);
        await page.locator('div:has(> label:has-text("Main Process")) input[type="text"]').fill('E2E Process');
        await page.locator('div:has(> label:has-text("Category")) input[type="text"]').fill('E2E Category');
        await page.locator('textarea[placeholder="Describe the risk in detail..."]').fill('E2E created risk for questionnaire flow.');
        await page.getByRole('button', { name: /Next Step/i }).click();

        // Step 2 (owner)
        await page.getByPlaceholder('Search by name...').fill(DEMO_ACCOUNTS.EMPLOYEE_OPERATIONS);
        await page.getByRole('button', { name: DEMO_ACCOUNTS.EMPLOYEE_OPERATIONS }).first().click();
        await page.getByRole('button', { name: /Next Step/i }).click();

        // Step 3 (defaults are ok)
        await page.getByRole('button', { name: /Create Risk/i }).click();
        await page.waitForURL(/\/risks\/\d+$/);

        const riskUrl = page.url();

        // Send questionnaire from Risk Assessment tab
        await page.getByRole('button', { name: /Risk Assessment/i }).click();
        await page.getByRole('button', { name: /Send questionnaire/i }).click();
        await expect(page.getByText('Questionnaire sent.')).toBeVisible({ timeout: 15000 });

        // Logout CRO
        await logout(page);

        // 2) Owner submits questionnaire
        await loginAsDemoUser(page, DEMO_ACCOUNTS.EMPLOYEE_OPERATIONS);
        await page.goto(riskUrl);

        await page.getByRole('button', { name: /Risk Assessment/i }).click();
        await page.getByRole('button', { name: /Open/i }).click();

        // Fill required questions in the modal
        const selectOption = async (questionText: string, optionText: string) => {
            const container = page.getByText(questionText, { exact: true }).locator('..').locator('..');
            const combobox = container.getByRole('combobox');
            await combobox.scrollIntoViewIfNeeded();
            await combobox.focus();
            await combobox.press('Enter');
            await page.getByRole('option', { name: optionText, exact: true }).click();
        };

        await selectOption('Has the risk description or scope changed since last review?', 'No');
        await selectOption('Are the existing controls still effective?', 'Yes');
        await selectOption('Expected trend over the next quarter', 'Stable');

        await page
            .getByText('Proposed mitigation actions or next steps', { exact: true })
            .locator('..')
            .locator('..')
            .locator('textarea')
            .fill('Monitor and review quarterly.');

        await page.getByRole('button', { name: /^Submit$/ }).click();
        await expect(page.getByText(/submitted/i)).toBeVisible({ timeout: 15000 });

        await page.getByRole('button', { name: /Close/i }).click();
        await expect(page.getByText('Submitted')).toBeVisible({ timeout: 15000 });

        // Logout Owner
        await logout(page);

        // 3) CRO sees notification
        await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO);
        await page.goto('/dashboard');

        // Open notification bell and assert submitted notification exists
        await page.getByRole('button', { name: /Notifications/i }).click({ timeout: 15000 });

        await expect(page.getByText('Questionnaire submitted')).toBeVisible({ timeout: 15000 });
    });
});
