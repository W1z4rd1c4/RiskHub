/**
 * Admin Console E2E Tests
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

test.describe('Admin Console', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsDemoUser(page, 'System Admin');
    });

    test.describe('Access Control', () => {
        test('should display admin console for admin user', async ({ page }) => {
            await page.goto('/admin');
            await waitForDataLoad(page);

            // Should show admin console
            await expect(page.locator('text=/Admin|Console|Settings/i').first()).toBeVisible();
        });
    });

    test.describe('User Management', () => {
        test('should display user list', async ({ page }) => {
            await page.goto('/admin');
            await waitForDataLoad(page);

            // Navigate to users section
            const usersTab = page.locator('button:has-text("Users"), a:has-text("Users"), [role="tab"]:has-text("Users")');
            if (await usersTab.first().isVisible()) {
                await usersTab.first().click();
            }

            // Should show users table
            await expect(page.locator('table, [role="grid"]').first()).toBeVisible();
        });
    });

    test.describe('Role Management', () => {
        test('should display roles section', async ({ page }) => {
            await page.goto('/admin');
            await waitForDataLoad(page);

            // Navigate to roles section
            const rolesTab = page.locator('button:has-text("Roles"), a:has-text("Roles"), [role="tab"]:has-text("Roles")');
            if (await rolesTab.first().isVisible()) {
                await rolesTab.first().click();
                await waitForDataLoad(page);
            }
        });
    });
});
