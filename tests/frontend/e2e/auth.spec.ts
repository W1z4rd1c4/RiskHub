/**
 * Authentication E2E Tests
 * RiskHub uses demo account picker (not traditional login form)
 */
import { test, expect } from '@playwright/test';
import { loginAsDemoUser } from './helpers/login';

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
            await page.click('[data-testid="logout-button"]');

            // Should redirect to login
            await expect(page).toHaveURL(/.*login/);
        });
    });

    test.describe('Role-based Access', () => {
        test('admin should see Admin Console link', async ({ page }) => {
            await loginAsDemoUser(page, 'System Admin');
            // Admin console link is in the sidebar
            await expect(page.locator('aside a[href="/admin"]')).toBeVisible({ timeout: 5000 });
        });

        test('employee should not see Admin Console link', async ({ page }) => {
            await loginAsDemoUser(page, 'Jana Horáková');
            await expect(page.locator('a[href="/admin"]')).not.toBeVisible();
        });
    });
});
