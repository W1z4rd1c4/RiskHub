/**
 * User Settings Isolation E2E Tests
 * Verifies that theme and language persist server-side per-user
 */
import { test, expect, type Page } from '@playwright/test';
import { loginAsDemoUser, logout, DEMO_ACCOUNTS } from './helpers/login';

async function waitForPreferencesSave(page: Page): Promise<void> {
    return page.waitForResponse((resp) =>
        resp.url().includes('/preferences')
        && resp.request().method() === 'PUT'
        && resp.status() === 200
    );
}

test.describe('User Settings Isolation', () => {
    test('theme should not persist across different users', async ({ page }) => {
        // Use demo accounts that are not used by most other E2E suites, to avoid cross-test interference.
        const userA = DEMO_ACCOUNTS.EMPLOYEE_FINANCE;
        const userB = DEMO_ACCOUNTS.EMPLOYEE_IT;

        // Login as User A
        await loginAsDemoUser(page, userA);
        await page.goto('/settings');

        // Click Appearance tab first
        await page.click('[data-testid="settings-tab-appearance"]');
        await page.waitForSelector('[data-testid="theme-dark"]', { timeout: 5000 });

        // Select dark theme
        await page.click('[data-testid="theme-dark"]');
        await expect(page.locator('html')).toHaveClass(/dark/);

        // Logout
        await logout(page);

        // Login as User B
        await loginAsDemoUser(page, userB);
        await page.goto('/settings');

        // Verify theme is NOT dark (should be default riskhub)
        // Click Appearance tab
        await page.click('[data-testid="settings-tab-appearance"]');
        await page.waitForSelector('[data-testid="theme-riskhub"]', { timeout: 5000 });
        // Default should be riskhub, not dark
        await expect(page.locator('[data-testid="theme-dark"]')).not.toHaveClass(/border-accent/);

        // Cleanup
        await logout(page);
    });

    test('user settings should persist across sessions', async ({ page }) => {
        const userA = DEMO_ACCOUNTS.EMPLOYEE_FINANCE;

        // Login as User A, set dark theme
        await loginAsDemoUser(page, userA);
        await page.goto('/settings');

        // Click Appearance tab first
        await page.click('[data-testid="settings-tab-appearance"]');
        await page.waitForSelector('[data-testid="theme-dark"]', { timeout: 5000 });
        await Promise.all([
            waitForPreferencesSave(page),
            page.click('[data-testid="theme-dark"]'),
        ]);

        // Logout
        await logout(page);

        // Login as User A again
        await loginAsDemoUser(page, userA);

        // Verify dark theme loaded from server
        await expect(page.locator('html')).toHaveClass(/dark/);

        // Cleanup: Reset to default
        await page.goto('/settings');
        await page.click('[data-testid="settings-tab-appearance"]');
        await page.waitForSelector('[data-testid="theme-riskhub"]', { timeout: 5000 });
        await page.click('[data-testid="theme-riskhub"]');
        await logout(page);
    });

    test('language should not persist across different users', async ({ page }) => {
        const userA = DEMO_ACCOUNTS.EMPLOYEE_FINANCE;
        const userB = DEMO_ACCOUNTS.EMPLOYEE_IT;

        // Login as User A, set Czech
        await loginAsDemoUser(page, userA);
        await page.goto('/settings');

        // Click Localization tab first
        await page.click('[data-testid="settings-tab-localization"]');
        await page.waitForSelector('[data-testid="language-cs"]', { timeout: 5000 });
        await Promise.all([
            waitForPreferencesSave(page),
            page.click('[data-testid="language-cs"]'),
        ]);

        // Verify Czech is applied (check for a Czech word)
        await expect(page.getByText('Čeština').first()).toBeVisible();

        // Logout
        await logout(page);

        // Login as User B
        await loginAsDemoUser(page, userB);
        await page.goto('/settings');

        // Click Localization tab
        await page.click('[data-testid="settings-tab-localization"]');
        await page.waitForSelector('[data-testid="language-en"]', { timeout: 5000 });

        // Verify English is default (not Czech)
        await expect(page.getByText('English').first()).toBeVisible();

        // Cleanup: Reset User A's language
        await logout(page);
        await loginAsDemoUser(page, userA);
        await page.goto('/settings');
        await page.click('[data-testid="settings-tab-localization"]');
        await page.waitForSelector('[data-testid="language-en"]', { timeout: 5000 });
        await Promise.all([
            waitForPreferencesSave(page),
            page.click('[data-testid="language-en"]'),
        ]);
        await logout(page);
    });
});
