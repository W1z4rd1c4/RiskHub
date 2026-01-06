/**
 * Authentication E2E Tests
 * RiskHub uses demo account picker (not traditional login form)
 */
import { test, expect, Page } from '@playwright/test';

// Helper function to login via demo account picker
async function loginAsDemoUser(page: Page, accountName: string) {
    await page.goto('/login');
    // Wait for the demo account buttons to load
    await page.waitForSelector(`button:has-text("${accountName}")`, { timeout: 10000 });
    // Click the demo account button containing the name
    await page.click(`button:has-text("${accountName}")`);
    // Wait for redirect - app redirects to / or /admin depending on user
    await page.waitForURL(/^http:\/\/localhost:5173\/(dashboard|admin|$)/, { timeout: 15000 });
}

test.describe('Authentication', () => {
    test.describe('Demo Login', () => {
        test('should display demo account picker', async ({ page }) => {
            await page.goto('/login');

            // Should show RiskHub Demo header
            await expect(page.locator('text=RiskHub Demo')).toBeVisible();

            // Should show account tier sections
            await expect(page.locator('text=Privileged')).toBeVisible();
            await expect(page.locator('text=Department Heads')).toBeVisible();
            await expect(page.locator('text=Employees')).toBeVisible();
        });

        test('should login as admin via demo picker', async ({ page }) => {
            await loginAsDemoUser(page, 'System Admin');

            // Should redirect away from login
            await expect(page).not.toHaveURL(/.*login/);
        });

        test('should login as CRO via demo picker', async ({ page }) => {
            await loginAsDemoUser(page, 'Anna Kowalski');

            await expect(page).not.toHaveURL(/.*login/);
        });

        test('should login as department head via demo picker', async ({ page }) => {
            await loginAsDemoUser(page, 'Eva Králová');

            await expect(page).not.toHaveURL(/.*login/);
        });

        test('should login as employee via demo picker', async ({ page }) => {
            await loginAsDemoUser(page, 'Jana Horáková');

            await expect(page).not.toHaveURL(/.*login/);
        });
    });

    test.describe('Logout', () => {
        test('should logout successfully', async ({ page }) => {
            await loginAsDemoUser(page, 'System Admin');

            // Click logout button
            await page.click('button:has(.lucide-log-out)');

            // Should redirect to login
            await expect(page).toHaveURL(/.*login/);
        });
    });

    test.describe('Role-based Access', () => {
        test('admin should see Admin Console link', async ({ page }) => {
            await loginAsDemoUser(page, 'System Admin');
            await expect(page.locator('a[href="/admin"]')).toBeVisible();
        });

        test('employee should not see Admin Console link', async ({ page }) => {
            await loginAsDemoUser(page, 'Jana Horáková');
            await expect(page.locator('a[href="/admin"]')).not.toBeVisible();
        });
    });
});
