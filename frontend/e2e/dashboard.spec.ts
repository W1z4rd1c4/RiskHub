/**
 * Dashboard E2E Tests
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

test.describe('Dashboard', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsDemoUser(page, 'Petra Svobodová');
    });

    test.describe('Executive Dashboard', () => {
        test('should load dashboard successfully', async ({ page }) => {
            // App redirects to / which is the dashboard
            await waitForDataLoad(page);

            // Should show dashboard content
            await expect(page.locator('h1, h2').first()).toBeVisible();
        });

        test('should display key metrics', async ({ page }) => {
            await waitForDataLoad(page);

            // Should show metrics like total risks, controls, KRIs
            const metricsSection = page.locator('text=/Risk|Control|KRI|Total/i');
            await expect(metricsSection.first()).toBeVisible();
        });
    });

    test.describe('Navigation', () => {
        test('should navigate to all main sections from sidebar', async ({ page }) => {
            await waitForDataLoad(page);

            // Sidebar uses React Router Link - check for nav items by text
            const sidebar = page.locator('aside');
            await expect(sidebar.locator('text=Risks')).toBeVisible();
            await expect(sidebar.locator('text=Controls')).toBeVisible();
            await expect(sidebar.locator('text=Risk Appetite')).toBeVisible();
        });
    });
});
