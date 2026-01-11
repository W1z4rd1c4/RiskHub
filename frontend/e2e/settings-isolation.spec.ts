/**
 * User Settings Isolation E2E Tests
 * Verifies that theme and language persist server-side per-user
 */
import { test, expect } from '@playwright/test';

// Helper function to login via demo account picker
async function loginAsDemoUser(page: import('@playwright/test').Page, accountName: string) {
    await page.goto('/login');
    await page.waitForSelector(`button:has-text("${accountName}")`, { timeout: 10000 });
    await page.click(`button:has-text("${accountName}")`);
    await page.waitForURL(/^http:\/\/localhost:5173\/(dashboard|admin|$)/, { timeout: 15000 });
}

async function logout(page: import('@playwright/test').Page) {
    await page.click('button:has(.lucide-log-out)');
    await page.waitForURL(/.*login/, { timeout: 10000 });
}

test.describe('User Settings Isolation', () => {
    test('theme should not persist across different users', async ({ page }) => {
        // Login as User A (CRO)
        await loginAsDemoUser(page, 'Anna Kowalski');
        await page.goto('/settings');

        // Select dark theme
        await page.click('[data-testid="theme-dark"]');
        await expect(page.locator('html')).toHaveClass(/theme-dark/);

        // Logout
        await logout(page);

        // Login as User B (Department Head)
        await loginAsDemoUser(page, 'Eva Králová');
        await page.goto('/settings');

        // Verify theme is NOT dark (should be default)
        await expect(page.locator('html')).not.toHaveClass(/theme-dark/);

        // Cleanup
        await logout(page);
    });

    test('user settings should persist across sessions', async ({ page }) => {
        // Login as User A, set dark theme
        await loginAsDemoUser(page, 'Anna Kowalski');
        await page.goto('/settings');
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
        await expect(page.locator('html')).toHaveClass(/theme-dark/);

        // Cleanup: Reset to default
        await page.goto('/settings');
        await page.click('[data-testid="theme-riskhub"]');
        await logout(page);
    });

    test('language should not persist across different users', async ({ page }) => {
        // Login as User A, set Czech
        await loginAsDemoUser(page, 'Anna Kowalski');
        await page.goto('/settings');
        await page.click('[data-testid="language-cs"]');

        // Wait for server sync
        await page.waitForResponse(resp =>
            resp.url().includes('/preferences') && resp.status() === 200
        );

        // Verify Czech is applied (check for a Czech word)
        await expect(page.getByText('Čeština')).toBeVisible();

        // Logout
        await logout(page);

        // Login as User B
        await loginAsDemoUser(page, 'Eva Králová');
        await page.goto('/settings');

        // Verify English is default (not Czech)
        await expect(page.getByText('English')).toBeVisible();

        // Cleanup: Reset User A's language
        await logout(page);
        await loginAsDemoUser(page, 'Anna Kowalski');
        await page.goto('/settings');
        await page.click('[data-testid="language-en"]');
        await logout(page);
    });
});
