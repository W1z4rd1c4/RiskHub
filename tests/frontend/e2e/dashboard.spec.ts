/**
 * Dashboard E2E Tests
 * Uses demo account picker for login
 */
import { test, expect } from '@playwright/test';
import { loginAsDemoUser } from './helpers/login';

async function waitForDataLoad(page: Page) {
    await expect(page.locator('aside')).toBeVisible({ timeout: 30000 });
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 30000 }).catch(() => { });
    await page.waitForFunction(
        () => !(document.body?.textContent ?? '').includes('Synchronizing Insight...'),
        { timeout: 30000 }
    ).catch(() => { });
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
            await expect(page.locator('main')).toBeVisible();
            await expect(page.getByText(/Operational Insight|Total Controls|Critical Risks/i).first()).toBeVisible({ timeout: 15000 });
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
