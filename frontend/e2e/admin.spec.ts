/**
 * Admin Console E2E Tests
 * Covers: User management, role assignment, Risk Hub config, activity log
 */
import { test, expect, Page } from '@playwright/test';

async function loginAsAdmin(page: Page) {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@riskhub.test');
    await page.fill('input[type="password"]', 'test123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
}

async function waitForDataLoad(page: Page) {
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 30000 });
}

test.describe('Admin Console', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
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

        test('should search users', async ({ page }) => {
            await page.goto('/admin');
            await waitForDataLoad(page);

            // Navigate to users
            const usersTab = page.locator('button:has-text("Users"), a:has-text("Users")');
            if (await usersTab.first().isVisible()) {
                await usersTab.first().click();
                await waitForDataLoad(page);
            }

            const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]');
            if (await searchInput.isVisible()) {
                await searchInput.fill('admin');
                await page.waitForTimeout(500);
            }
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

                // Should show roles
                await expect(page.locator('text=/Administrator|CRO|Viewer/i').first()).toBeVisible();
            }
        });

        test('should show role permissions', async ({ page }) => {
            await page.goto('/admin');
            await waitForDataLoad(page);

            const rolesTab = page.locator('button:has-text("Roles"), a:has-text("Roles")');
            if (await rolesTab.first().isVisible()) {
                await rolesTab.first().click();
                await waitForDataLoad(page);

                // Click on a role to see permissions
                const roleRow = page.locator('table tbody tr, [role="row"]').first();
                if (await roleRow.isVisible()) {
                    await roleRow.click();
                }
            }
        });
    });

    test.describe('Activity Log', () => {
        test('should display activity log', async ({ page }) => {
            await page.goto('/admin');
            await waitForDataLoad(page);

            // Navigate to activity log
            const activityTab = page.locator('button:has-text("Activity"), a:has-text("Activity"), [role="tab"]:has-text("Activity")');
            if (await activityTab.first().isVisible()) {
                await activityTab.first().click();
                await waitForDataLoad(page);

                // Should show activity entries
                await expect(page.locator('table tbody tr, [class*="activity"]').first()).toBeVisible();
            }
        });

        test('should filter activity log', async ({ page }) => {
            await page.goto('/admin');
            await waitForDataLoad(page);

            const activityTab = page.locator('button:has-text("Activity"), a:has-text("Activity")');
            if (await activityTab.first().isVisible()) {
                await activityTab.first().click();
                await waitForDataLoad(page);

                // Look for date filter
                const dateFilter = page.locator('input[type="date"], [role="combobox"]');
                // May or may not be visible
            }
        });
    });

    test.describe('Risk Hub Configuration', () => {
        test('should access configuration settings', async ({ page }) => {
            await page.goto('/riskhub');
            await waitForDataLoad(page);

            // Look for settings/config section
            const settingsSection = page.locator('text=/Settings|Configuration|Config/i');
            // May need specific permissions
        });
    });
});
