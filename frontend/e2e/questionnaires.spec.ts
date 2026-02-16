import { test, expect } from '@playwright/test';
import { DEMO_ACCOUNTS, loginAsDemoUser, logout } from './helpers/login';

test.describe('questionnaire workflow', () => {
    test('CRO sends, owner submits, CRO notified', async ({ page }) => {
        const riskName = `E2E Questionnaire Risk ${Date.now()}`;
        const riskNameRe = new RegExp(riskName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

        const clickNext = async () => {
            await page.getByRole('button', { name: /next step|next|další/i }).click();
        };

        // 1) CRO creates a risk and sends questionnaire
        await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO);
        await page.goto('/risks');

        await page.getByRole('button', { name: /new risk|nové riziko/i }).click();

        // Step 1
        await page.getByPlaceholder('Enter a short, descriptive name for this risk...').fill(riskName);
        await page.locator('div:has(> label:has-text("Main Process")) input[type="text"]').fill('E2E Process');
        await page.locator('div:has(> label:has-text("Category")) input[type="text"]').fill('E2E Category');
        await page.locator('textarea[placeholder="Describe the risk in detail..."]').fill('E2E created risk for questionnaire flow.');
        await clickNext();

        // Step 2 (owner)
        await page.getByPlaceholder(/search by name|hledat podle názvu/i).fill(DEMO_ACCOUNTS.EMPLOYEE_OPERATIONS);
        await page.getByRole('button', { name: DEMO_ACCOUNTS.EMPLOYEE_OPERATIONS }).first().click();
        await clickNext();

        // Step 3 (defaults are ok)
        await page.getByRole('button', { name: /create risk|vytvořit riziko/i }).click();
        await page.waitForURL(/\/risks\/\d+$/);

        const riskUrl = page.url();

        // Send questionnaire from Risk Assessment tab
        await page.getByRole('button', { name: /risk assessment|hodnocení rizik|hodnocení rizika/i }).click();
        await page.getByRole('button', { name: /send questionnaire|odeslat dotazník/i }).click();
        await expect(page.getByText(/questionnaire sent|dotazník odeslán/i)).toBeVisible({ timeout: 15000 });

        // Logout CRO
        await logout(page);

        // 2) Owner submits questionnaire
        await loginAsDemoUser(page, DEMO_ACCOUNTS.EMPLOYEE_OPERATIONS);
        await page.goto(riskUrl);

        await page.getByRole('button', { name: /risk assessment|hodnocení rizik|hodnocení rizika/i }).click();
        await page.getByRole('button', { name: /open|otevřít/i }).click();

        // Fill required questions in the modal
        const selectOption = async (questionText: string | RegExp, optionText: string | RegExp) => {
            const container = page.getByText(questionText).first().locator('..').locator('..');
            const combobox = container.getByRole('combobox');
            await combobox.scrollIntoViewIfNeeded();
            await combobox.focus();
            await combobox.press('Enter');
            if (typeof optionText === 'string') {
                await page.getByRole('option', { name: optionText, exact: true }).click();
                return;
            }
            await page.getByRole('option', { name: optionText }).click();
        };

        await selectOption(
            /Has the risk description or scope changed since last review|Změnil se.*popis|Změnil se.*rozsah/i,
            /^(no|ne)$/i
        );
        await selectOption(
            /Are the existing controls still effective|Jsou stávající kontroly.*efektivní/i,
            /^(yes|ano)$/i
        );
        await selectOption(/Likelihood \(next 12 months\)|Pravděpodobnost.*12/i, /3\s+—/);
        await selectOption(/Worst-case financial impact|Nejhorší finanční dopad/i, /3\s+—/);
        await selectOption(/Expected trend|Očekávaný trend/i, /^(stable|stabilní)$/i);

        await page
            .getByText(/Proposed mitigation actions or next steps|Navrhovaná mitigace|další kroky/i)
            .locator('..')
            .locator('..')
            .locator('textarea')
            .fill('Monitor and review quarterly.');

        await page.getByRole('button', { name: /^submit$|^odevzdat$|^odeslat$/i }).click();
        await expect(
            page
                .getByText(/status:|stav:/i)
                .locator('..')
                .getByText(/submitted|odevzdáno/i)
        ).toBeVisible({ timeout: 15000 });

        await page.getByRole('button', { name: /close|zavřít/i }).click();
        await expect(page.locator('tbody').getByText(/Submitted|Odevzdáno/i)).toBeVisible({ timeout: 15000 });

        // Logout Owner
        await logout(page);

        // 3) CRO sees notification
        await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO);
        await page.goto('/dashboard');

        // Open notification bell and assert submitted notification exists
        await page.getByRole('button', { name: /Notifications/i }).click({ timeout: 15000 });

        await expect(page.getByRole('button', { name: riskNameRe }).first()).toBeVisible({ timeout: 15000 });
    });
});
