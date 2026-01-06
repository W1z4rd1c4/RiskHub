/**
 * KRI Management E2E Tests
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

test.describe('KRI Management', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsDemoUser(page, 'Petra Svobodová');
    });

    test.describe('KRI List', () => {
        test('should display KRI list', async ({ page }) => {
            await page.goto('/kris');
            await waitForDataLoad(page);

            // Should show KRIs table or cards
            await expect(page.locator('table, [role="grid"], .grid').first()).toBeVisible();
        });
    });

    test.describe('KRI Detail', () => {
        test('should navigate to KRI detail', async ({ page }) => {
            await page.goto('/kris');
            await waitForDataLoad(page);

            const firstRow = page.locator('table tbody tr, .grid > div').first();
            if (await firstRow.isVisible()) {
                await firstRow.click();
                await expect(page.locator('h1, h2').first()).toBeVisible();
            }
        });
    });
});
