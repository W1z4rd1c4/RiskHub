/**
 * Risk Management E2E Tests
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

test.describe('Risk Management', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsDemoUser(page, 'Petra Svobodová');
    });

    test.describe('Risk List', () => {
        test('should display risks list', async ({ page }) => {
            await page.goto('/risks');
            await waitForDataLoad(page);

            // Should show table with risks
            await expect(page.locator('table').first()).toBeVisible();
        });

        test('should search risks', async ({ page }) => {
            await page.goto('/risks');
            await waitForDataLoad(page);

            // Find search input
            const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]');
            if (await searchInput.isVisible()) {
                await searchInput.fill('test');
                await page.waitForTimeout(500);
            }
        });
    });

    test.describe('Risk Detail', () => {
        test('should navigate to risk detail page', async ({ page }) => {
            await page.goto('/risks');
            await waitForDataLoad(page);

            // Click first risk
            const firstRow = page.locator('table tbody tr').first();
            if (await firstRow.isVisible()) {
                await firstRow.click();
                // Should show risk details
                await expect(page.locator('h1, h2').first()).toBeVisible();
            }
        });
    });
});
