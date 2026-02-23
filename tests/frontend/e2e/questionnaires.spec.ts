import { test, expect } from '@playwright/test';
import { DEMO_ACCOUNTS, loginAsDemoUser, logout } from './helpers/login';

test.describe('questionnaire workflow', () => {
    test('CRO sends, owner submits, CRO notified', async ({ page }) => {
        const riskName = `E2E Questionnaire Risk ${Date.now()}`;
        const riskNameRe = new RegExp(riskName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

        const clickNext = async () => {
            await page.getByRole('button', { name: /next step|next|další/i }).click();
        };
        const fillTextInputForLabel = async (label: RegExp, value: string) => {
            const input = page
                .locator('label')
                .filter({ hasText: label })
                .first()
                .locator('xpath=..')
                .locator('input[type="text"]')
                .first();
            await input.fill(value);
        };
        const fillTextareaForLabel = async (label: RegExp, value: string) => {
            const textarea = page
                .locator('label')
                .filter({ hasText: label })
                .first()
                .locator('xpath=..')
                .locator('textarea')
                .first();
            await textarea.fill(value);
        };

        // 1) CRO creates a risk and sends questionnaire
        await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO);
        await page.goto('/risks');

        await page.getByRole('button', { name: /new risk|nové riziko/i }).click();

        // Step 1
        await fillTextInputForLabel(/risk name|název rizika/i, riskName);
        await fillTextInputForLabel(/main process|hlavní proces/i, 'E2E Process');
        await fillTextInputForLabel(/category|kategorie/i, 'E2E Category');
        await fillTextareaForLabel(/risk description|popis rizika/i, 'E2E created risk for questionnaire flow.');
        await clickNext();

        // Step 2 (owner)
        await fillTextInputForLabel(/risk owner|vlastník rizika|owner/i, DEMO_ACCOUNTS.EMPLOYEE_OPERATIONS);
        await page.getByRole('button', { name: DEMO_ACCOUNTS.EMPLOYEE_OPERATIONS }).first().click();
        await clickNext();

        // Step 3 (defaults are ok)
        await page.getByRole('button', { name: /create risk|vytvořit riziko/i }).click();
        await page.waitForURL(/\/risks\/\d+$/);

        const riskUrl = page.url();

        // Send questionnaire from Risk Assessment tab
        await page.getByRole('button', { name: /risk assessment|hodnocení rizik|hodnocení rizika/i }).click();
        await page.getByRole('button', { name: /send questionnaire|odeslat dotazník/i }).click();
        await expect(page.getByText(/questionnaire sent|dotazník.*odeslán/i)).toBeVisible({ timeout: 15000 });

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
            await combobox.click({ timeout: 10000 });
            await expect(page.getByRole('listbox')).toBeVisible({ timeout: 10000 });

            const option =
                typeof optionText === 'string'
                    ? page.getByRole('option', { name: optionText, exact: true }).first()
                    : page.getByRole('option', { name: optionText }).first();
            await expect(option).toBeVisible({ timeout: 10000 });
            await option.click({ timeout: 10000, force: true });
            await page.keyboard.press('Escape').catch(() => {
                // no-op when listbox already closed by selection
            });
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
        await expect(page.getByRole('button', { name: /^submit$|^odevzdat$|^odeslat$/i })).toHaveCount(0, {
            timeout: 15000,
        });

        const closeButton = page.getByRole('button', { name: /close|zavřít/i });
        if (await closeButton.isVisible().catch(() => false)) {
            await closeButton.click();
        }
        await expect(page.locator('tbody').getByText(/Submitted|Odevzdáno/i)).toBeVisible({ timeout: 15000 });

        // Logout Owner
        await logout(page);

        // 3) CRO sees notification
        await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO);
        await page.goto('/dashboard');

        // Open notification bell and assert submitted notification exists
        await page.getByRole('button', { name: /notifications|oznámení/i }).click({ timeout: 15000 });

        await expect(page.getByText(riskNameRe).first()).toBeVisible({ timeout: 30000 });
    });
});
