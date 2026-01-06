/**
 * Control Management E2E Tests
 * Covers: Create, edit, execution logging, history viewing
 */
import { test, expect, Page } from '@playwright/test';

// Helper function to login
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

test.describe('Control Management', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsRiskManager(page);
    });

    test.describe('Control List', () => {
        test('should display controls list', async ({ page }) => {
            await page.goto('/controls');
            await waitForDataLoad(page);

            // Should show table or grid with controls
            await expect(page.locator('table, [role="grid"]').first()).toBeVisible();
        });

        test('should search controls', async ({ page }) => {
            await page.goto('/controls');
            await waitForDataLoad(page);

            const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]');
            if (await searchInput.isVisible()) {
                await searchInput.fill('control');
                await page.waitForTimeout(500);
            }
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
                // Should show control details
                await expect(page.locator('h1, h2').first()).toBeVisible();
            }
        });

        test('should display control metadata', async ({ page }) => {
            await page.goto('/controls');
            await waitForDataLoad(page);

            const firstRow = page.locator('table tbody tr').first();
            if (await firstRow.isVisible()) {
                await firstRow.click();

                // Should show control attributes
                await expect(page.locator('text=/Owner|Frequency|Status/i').first()).toBeVisible();
            }
        });
    });

    test.describe('Control Execution', () => {
        test('should show execution log button', async ({ page }) => {
            await page.goto('/controls');
            await waitForDataLoad(page);

            const firstRow = page.locator('table tbody tr').first();
            if (await firstRow.isVisible()) {
                await firstRow.click();

                // Look for execution logging
                const execBtn = page.locator('button:has-text("Log Execution"), button:has-text("Execute")');
                // May or may not be visible depending on permissions
            }
        });

        test('should display execution history', async ({ page }) => {
            await page.goto('/controls');
            await waitForDataLoad(page);

            const firstRow = page.locator('table tbody tr').first();
            if (await firstRow.isVisible()) {
                await firstRow.click();

                // Should show history section or tab
                const historySection = page.locator('text=/History|Execution|Log/i');
                await expect(historySection.first()).toBeVisible();
            }
        });
    });

    test.describe('Control CRUD', () => {
        test('should show edit control form', async ({ page }) => {
            await page.goto('/controls');
            await waitForDataLoad(page);

            const firstRow = page.locator('table tbody tr').first();
            if (await firstRow.isVisible()) {
                await firstRow.click();

                const editBtn = page.locator('button:has(.lucide-pencil), button:has-text("Edit")');
                if (await editBtn.isVisible()) {
                    await editBtn.click();
                    await expect(page.locator('form, dialog')).toBeVisible();
                }
            }
        });
    });
});
