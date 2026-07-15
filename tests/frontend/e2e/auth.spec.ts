/**
 * Authentication E2E Tests
 * RiskHub uses demo account picker (not traditional login form)
 */
import { test, expect } from '@playwright/test';
import { DEMO_ACCOUNTS, loginAsDemoUser } from './helpers/login';
import { waitForPreferencesHydration } from './helpers/waitForPreferencesHydration';

test.describe('Authentication', () => {
    test.describe('Demo Login', () => {
        test('should display demo account picker', async ({ page }) => {
            await page.goto('/login');

            // Should show RiskHub Demo header
            await expect(page.locator('text=RiskHub Demo')).toBeVisible();

            // Ten distinct personas share one responsive, five-column desktop grid.
            const grid = page.getByTestId('demo-persona-grid');
            await expect(grid).toBeVisible();
            await expect(grid).toHaveClass(/lg:grid-cols-5/);
            await expect(grid.locator('button')).toHaveCount(10);

            // The dedicated CISO card carries both role and department context.
            const cisoCard = page.getByTestId('demo-persona-ciso@riskhub.local');
            await expect(cisoCard).toContainText(DEMO_ACCOUNTS.CISO);
            await expect(cisoCard).toContainText('Chief Information Security Officer');
            await expect(cisoCard).toContainText('IT');
        });

        test('should login as CISO via demo picker', async ({ page }) => {
            await loginAsDemoUser(page, DEMO_ACCOUNTS.CISO);

            await expect(page).not.toHaveURL(/.*login/);
            await expect(page.getByTestId('logout-button')).toBeVisible();
            await expect(page.locator('aside')).toContainText(DEMO_ACCOUNTS.CISO);
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

        test('should stay authenticated after a same-tab reload', async ({ page }) => {
            await loginAsDemoUser(page, 'Anna Kowalski');

            await page.reload({ waitUntil: 'domcontentloaded' });
            await waitForPreferencesHydration(page);

            await expect(page).not.toHaveURL(/.*login/);
            await expect(page.locator('[data-testid="logout-button"]')).toBeVisible();
        });
    });

    test.describe('Logout', () => {
        test('should logout successfully', async ({ page }) => {
            await loginAsDemoUser(page, 'System Admin');

            // Click logout button
            await page.click('[data-testid="logout-button"]');

            // Should redirect to login
            await expect(page).toHaveURL(/.*login/);

            await page.reload({ waitUntil: 'domcontentloaded' });
            await expect(page).toHaveURL(/.*login/);
            await expect(page.locator('[data-testid="logout-button"]')).not.toBeVisible();
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
