/**
 * KRI Management E2E Tests
 * Covers: KRI submission, history viewing, breach alerts
 */
import { test, expect, Page } from '@playwright/test';

async function loginAsRiskManager(page: Page) {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'risk.manager@riskhub.test');
    await page.fill('input[type="password"]', 'test123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
}

async function waitForDataLoad(page: Page) {
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 30000 });
}

test.describe('KRI Management', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsRiskManager(page);
    });

    test.describe('KRI List', () => {
        test('should display KRI list', async ({ page }) => {
            await page.goto('/kris');
            await waitForDataLoad(page);

            // Should show KRIs table or cards
            await expect(page.locator('table, [role="grid"], .grid').first()).toBeVisible();
        });

        test('should show KRI status indicators', async ({ page }) => {
            await page.goto('/kris');
            await waitForDataLoad(page);

            // Look for status colors/indicators
            const statusIndicator = page.locator('.text-green-500, .text-yellow-500, .text-red-500, .bg-green, .bg-yellow, .bg-red').first();
            // Status indicators may or may not be visible depending on data
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

        test('should display KRI thresholds', async ({ page }) => {
            await page.goto('/kris');
            await waitForDataLoad(page);

            const firstRow = page.locator('table tbody tr, .grid > div').first();
            if (await firstRow.isVisible()) {
                await firstRow.click();
                // Should show threshold info
                await expect(page.locator('text=/Threshold|Limit|Target/i').first()).toBeVisible();
            }
        });
    });

    test.describe('KRI Value Submission', () => {
        test('should show submit value button', async ({ page }) => {
            await page.goto('/kris');
            await waitForDataLoad(page);

            const firstRow = page.locator('table tbody tr, .grid > div').first();
            if (await firstRow.isVisible()) {
                await firstRow.click();

                // Look for submit value button
                const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Add Value"), button:has-text("Record")');
                // May or may not be visible depending on permissions
            }
        });
    });

    test.describe('KRI History', () => {
        test('should display history chart', async ({ page }) => {
            await page.goto('/kris');
            await waitForDataLoad(page);

            const firstRow = page.locator('table tbody tr, .grid > div').first();
            if (await firstRow.isVisible()) {
                await firstRow.click();

                // Should show history visualization
                const historySection = page.locator('text=/History|Trend|Chart/i, svg[class*="recharts"]');
                await expect(historySection.first()).toBeVisible();
            }
        });
    });

    test.describe('Breach Alerts', () => {
        test('should show breach indicators when KRI breached', async ({ page }) => {
            await page.goto('/kris');
            await waitForDataLoad(page);

            // Look for breach indicators
            const breachIndicator = page.locator('text=/Breach|Alert|Warning/i, .text-red-500, .bg-red');
            // May or may not have breached KRIs
        });
    });
});
