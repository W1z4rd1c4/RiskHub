/**
 * Authentication E2E Tests
 * Covers: Login, logout, session handling, role-based access
 */
import { test, expect, Page } from '@playwright/test';

// Helper function to login
async function login(page: Page, email: string, password: string = 'test123') {
    await page.goto('/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
}

test.describe('Authentication', () => {
    test.describe('Login Flow', () => {
        test('should login with valid credentials', async ({ page }) => {
            await login(page, 'admin@riskhub.test');

            // Should redirect to dashboard
            await expect(page).toHaveURL('/');

            // Should show user info in header
            await expect(page.locator('text=Admin')).toBeVisible();
        });

        test('should show error with invalid credentials', async ({ page }) => {
            await page.goto('/login');
            await page.fill('input[type="email"]', 'invalid@test.com');
            await page.fill('input[type="password"]', 'wrongpassword');
            await page.click('button[type="submit"]');

            // Should show error message
            await expect(page.locator('text=Invalid credentials')).toBeVisible();

            // Should stay on login page
            await expect(page).toHaveURL(/.*login/);
        });

        test('should require email and password', async ({ page }) => {
            await page.goto('/login');

            // Try to submit empty form
            await page.click('button[type="submit"]');

            // Should stay on login page
            await expect(page).toHaveURL(/.*login/);
        });
    });

    test.describe('Logout', () => {
        test('should logout successfully', async ({ page }) => {
            await login(page, 'admin@riskhub.test');
            await expect(page).toHaveURL('/');

            // Click logout button
            await page.click('button:has(.lucide-log-out)');

            // Should redirect to login
            await expect(page).toHaveURL(/.*login/);
        });
    });

    test.describe('Role-based Access', () => {
        test('admin should see Admin Console link', async ({ page }) => {
            await login(page, 'admin@riskhub.test');
            await expect(page.locator('a[href="/admin"]')).toBeVisible();
        });

        test('employee should not see Admin Console link', async ({ page }) => {
            await login(page, 'ops.employee@riskhub.test');
            await expect(page.locator('a[href="/admin"]')).not.toBeVisible();
        });

        test('employee should be denied access to admin routes', async ({ page }) => {
            await login(page, 'ops.employee@riskhub.test');

            // Try direct navigation to admin
            await page.goto('/admin');

            // Should show access denied or redirect
            const denied = page.locator('text=Access Denied');
            const loginPage = page.locator('input[type="email"]');

            // Either shows denied message or redirects to login
            await expect(denied.or(loginPage)).toBeVisible({ timeout: 5000 });
        });
    });

    test.describe('Protected Routes', () => {
        test('should redirect to login when not authenticated', async ({ page }) => {
            // Clear any existing session
            await page.context().clearCookies();

            // Try to access protected route
            await page.goto('/risks');

            // Should redirect to login
            await expect(page).toHaveURL(/.*login/);
        });
    });
});
