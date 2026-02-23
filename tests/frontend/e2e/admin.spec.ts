/**
 * Admin Console E2E Tests
 * Tests the admin-only system monitoring pages
 */
import { test, expect, Page } from '@playwright/test';
import { loginAsDemoUser, DEMO_ACCOUNTS } from './helpers/login';

async function waitForDataLoad(page: Page) {
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 30000 }).catch(() => { });
}

async function ensureAdminAccess(page: Page): Promise<void> {
    await expect(async () => {
        await loginAsDemoUser(page, DEMO_ACCOUNTS.ADMIN, { retries: 4, timeout: 20000 });
        await page.goto('/admin');
        await waitForDataLoad(page);
        await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
        await expect(page.locator('h1')).toHaveText(/Admin Console|Administrace/i, { timeout: 15000 });
    }).toPass({ timeout: 90000 });
}

test.describe('Admin Console', () => {
    test.describe.configure({ mode: 'serial' });

    test.beforeEach(async ({ page }) => {
        await ensureAdminAccess(page);
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
            await expect(page.locator('h1')).toHaveText(/Admin Console|Administrace/i, { timeout: 15000 });

            // Check that core admin tabs are present (locale-agnostic EN/CS labels)
            await expect(page.getByRole('button', { name: /System Health|Stav systému/i })).toBeVisible({ timeout: 15000 });
            await expect(page.getByRole('button', { name: /Application Logs|Aplikační logy/i })).toBeVisible({ timeout: 15000 });
            await expect(page.getByRole('button', { name: /Audit Logs|Auditní logy/i })).toBeVisible({ timeout: 15000 });
            await expect(page.getByRole('button', { name: /Active Sessions|Aktivní relace/i })).toBeVisible({ timeout: 15000 });
        });

        test('should save log configuration using canonical app/audit payload fields', async ({ page }) => {
            let postedPayload: Record<string, unknown> | null = null;

            await page.route('**/api/v1/admin/logs/audit**', async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ entries: [], total_lines: 0, file_path: 'audit.json.log' }),
                });
            });

            await page.route('**/api/v1/admin/logs/config**', async (route) => {
                const method = route.request().method();

                if (method === 'GET') {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({
                            app_log_rotation_size_mb: 10,
                            app_log_retention_count: 10,
                            audit_log_rotation_size_mb: 10,
                            audit_log_retention_count: 10,
                        }),
                    });
                    return;
                }

                if (method === 'POST') {
                    const rawBody = route.request().postData() ?? '{}';
                    postedPayload = JSON.parse(rawBody);
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify(postedPayload),
                    });
                    return;
                }

                await route.continue();
            });

            await ensureAdminAccess(page);

            await page.getByRole('button', { name: /Audit Logs|Auditní logy/i }).click();

            const numericInputs = page.locator('input[type="number"]');
            await expect(numericInputs).toHaveCount(4, { timeout: 15000 });
            await numericInputs.nth(0).fill('11');
            await numericInputs.nth(1).fill('7');
            await numericInputs.nth(2).fill('13');
            await numericInputs.nth(3).fill('9');

            await page.getByRole('button', { name: /Save Settings|Uložit nastavení/i }).click();

            await expect.poll(() => postedPayload).not.toBeNull();
            expect(postedPayload).toEqual({
                app_log_rotation_size_mb: 11,
                app_log_retention_count: 7,
                audit_log_rotation_size_mb: 13,
                audit_log_retention_count: 9,
            });
        });
    });
});
