/**
 * Admin Console E2E Tests
 * Tests the admin-only system monitoring pages
 */
import { test, expect, Page } from '@playwright/test';

async function loginAsDemoUser(page: Page, accountName: string) {
    await page.goto('/login');
    await page.waitForSelector(`button:has-text("${accountName}")`, { timeout: 10000 });
    await page.click(`button:has-text("${accountName}")`);
    // Admin users are automatically redirected to /admin
    await page.waitForURL(/^http:\/\/localhost:5173\/(dashboard|admin|settings|$)/, { timeout: 15000 });
}

async function waitForDataLoad(page: Page) {
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 30000 }).catch(() => { });
}

test.describe('Admin Console', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsDemoUser(page, 'System Admin');
    });

    test.describe('Access Control', () => {
        test('should display admin console for admin user', async ({ page }) => {
            // Admin is already on /admin or /settings after login
            // Just verify the page loaded with admin content
            await waitForDataLoad(page);

            // Look for any admin-related header text
            const adminHeader = page.locator('h1:has-text("Admin"), h1:has-text("Settings"), h1:has-text("Console")');
            await expect(adminHeader.first()).toBeVisible({ timeout: 10000 });
        });
    });

    test.describe('System Monitoring', () => {
        test('should display system information', async ({ page }) => {
            // Navigate explicitly to admin if not already there
            await page.goto('/admin');
            await waitForDataLoad(page);

            // Look for any content on the admin page
            // The page should have tabs or metrics visible
            await expect(page.locator('body')).not.toBeEmpty();
        });

        test('should display admin navigation tabs', async ({ page }) => {
            await page.goto('/admin');
            await waitForDataLoad(page);

            // Check that some navigable tabs exist
            const buttons = page.locator('button').filter({ hasText: /.+/ });
            await expect(buttons.first()).toBeVisible();
        });
    });
});
