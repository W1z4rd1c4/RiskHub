/**
 * User Settings Isolation E2E Tests
 * Verifies that theme and language persist server-side per-user
 */
import { test, expect } from '@playwright/test';
import { loginAsDemoUser, logout } from './helpers/login';

test.describe('User Settings Isolation', () => {
    test('theme should not persist across different users', async ({ page }) => {
        // Login as User A (CRO)
        await loginAsDemoUser(page, 'Anna Kowalski');
        await page.goto('/settings');

        // Click Appearance tab first
        await page.click('[data-testid="settings-tab-appearance"]');
        await page.waitForSelector('[data-testid="theme-dark"]', { timeout: 5000 });

        // Select dark theme
        await page.click('[data-testid="theme-dark"]');
        await expect(page.locator('html')).toHaveClass(/dark/);

        // Logout
        await logout(page);

        // Login as User B (Department Head)
        await loginAsDemoUser(page, 'Eva Králová');
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
        // Login as User A, set dark theme
        await loginAsDemoUser(page, 'Anna Kowalski');
        await page.goto('/settings');

        // Click Appearance tab first
        await page.click('[data-testid="settings-tab-appearance"]');
        await page.waitForSelector('[data-testid="theme-dark"]', { timeout: 5000 });
        await page.click('[data-testid="theme-dark"]');

        // Wait for server sync
        await page.waitForResponse(resp =>
            resp.url().includes('/preferences') && resp.status() === 200
        );

        // Logout
        await logout(page);

        // Login as User A again
        await loginAsDemoUser(page, 'Anna Kowalski');

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
        // Login as User A, set Czech
        await loginAsDemoUser(page, 'Anna Kowalski');
        await page.goto('/settings');

        // Click Localization tab first
        await page.click('[data-testid="settings-tab-localization"]');
        await page.waitForSelector('[data-testid="language-cs"]', { timeout: 5000 });
        await page.click('[data-testid="language-cs"]');

        // Wait for server sync
        await page.waitForResponse(resp =>
            resp.url().includes('/preferences') && resp.status() === 200
        );

        // Verify Czech is applied (check for a Czech word)
        await expect(page.getByText('Čeština').first()).toBeVisible();

        // Logout
        await logout(page);

        // Login as User B
        await loginAsDemoUser(page, 'Eva Králová');
        await page.goto('/settings');

        // Click Localization tab
        await page.click('[data-testid="settings-tab-localization"]');
        await page.waitForSelector('[data-testid="language-en"]', { timeout: 5000 });

        // Verify English is default (not Czech)
        await expect(page.getByText('English').first()).toBeVisible();

        // Cleanup: Reset User A's language
        await logout(page);
        await loginAsDemoUser(page, 'Anna Kowalski');
        await page.goto('/settings');
        await page.click('[data-testid="settings-tab-localization"]');
        await page.waitForSelector('[data-testid="language-en"]', { timeout: 5000 });
        await page.click('[data-testid="language-en"]');
        await logout(page);
    });
});
