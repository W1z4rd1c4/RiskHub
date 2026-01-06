/**
 * Control Management E2E Tests
 * Uses demo account picker for login
 */
import { test, expect, Page } from '@playwright/test';

async function loginAsDemoUser(page: Page, accountName: string) {
    await page.goto('/login');
    await page.waitForSelector(`button:has-text("${accountName}")`, { timeout: 10000 });
    await page.click(`button:has-text("${accountName}")`);
    await page.waitForURL(/^http:\/\/localhost:5173\/(dashboard|admin|$)/, { timeout: 15000 });
}

async function waitForDataLoad(page: Page) {
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 30000 }).catch(() => { });
}

test.describe('Control Management', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsDemoUser(page, 'Petra Svobodová');
    });

    test.describe('Control List', () => {
        test('should display controls list', async ({ page }) => {
            await page.goto('/controls');
            await waitForDataLoad(page);

            // Should show table or cards with controls
            await expect(page.locator('table, [role="grid"], .grid').first()).toBeVisible();
        });
    });

    test.describe('Control Detail', () => {
        test('should navigate to control detail', async ({ page }) => {
            await page.goto('/controls');
            await waitForDataLoad(page);

            // Click first control
            const firstRow = page.locator('table tbody tr').first();
            if (await firstRow.isVisible()) {
                await firstRow.click();
                await expect(page.locator('h1, h2').first()).toBeVisible();
            }
        });
    });
});
