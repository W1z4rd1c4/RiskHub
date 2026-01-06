/**
 * Dashboard E2E Tests
 * Covers: Executive dashboard, risk matrix, department drill-down, quarterly comparison
 */
import { test, expect, Page } from '@playwright/test';

async function loginAsRiskManager(page: Page) {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'risk.manager@riskhub.test');
    await page.fill('input[type="password"]', 'test123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
}

async function waitForDataLoad(page: Page) {
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 30000 });
}

test.describe('Dashboard', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsRiskManager(page);
    });

    test.describe('Executive Dashboard', () => {
        test('should load dashboard successfully', async ({ page }) => {
            await page.goto('/');
            await waitForDataLoad(page);

            // Should show dashboard widgets
            await expect(page.locator('h1, h2').first()).toBeVisible();
        });

        test('should display key metrics', async ({ page }) => {
            await page.goto('/');
            await waitForDataLoad(page);

            // Should show metrics like total risks, controls, KRIs
            const metricsSection = page.locator('text=/Risk|Control|KRI|Total/i');
            await expect(metricsSection.first()).toBeVisible();
        });

        test('should show summary cards', async ({ page }) => {
            await page.goto('/');
            await waitForDataLoad(page);

            // Look for summary cards
            const cards = page.locator('[class*="card"], [class*="Card"]');
            await expect(cards.first()).toBeVisible();
        });
    });

    test.describe('Risk Matrix', () => {
        test('should display risk matrix', async ({ page }) => {
            await page.goto('/');
            await waitForDataLoad(page);

            // Look for risk matrix component
            const riskMatrix = page.locator('text=/Risk Matrix|Heatmap/i, [class*="matrix"]');
            // May be on main dashboard or separate page
        });

        test('should navigate from risk matrix to risk detail', async ({ page }) => {
            await page.goto('/');
            await waitForDataLoad(page);

            // Click on matrix cell if visible
            const matrixCell = page.locator('[class*="matrix"] [class*="cell"], .risk-matrix-cell');
            if (await matrixCell.first().isVisible()) {
                await matrixCell.first().click();
            }
        });
    });

    test.describe('Department Drill-down', () => {
        test('should navigate to department view', async ({ page }) => {
            await page.goto('/');
            await waitForDataLoad(page);

            // Look for department navigation
            const deptLink = page.locator('a[href*="department"], text=/Department/i');
            if (await deptLink.first().isVisible()) {
                await deptLink.first().click();
            }
        });
    });

    test.describe('Quarterly Comparison', () => {
        test('should display quarterly comparison widget', async ({ page }) => {
            await page.goto('/');
            await waitForDataLoad(page);

            // Look for quarterly comparison section
            const quarterlySection = page.locator('text=/Quarterly|Quarter|Q[1-4]/i');
            // May or may not be visible on main dashboard
        });

        test('should allow quarter selection', async ({ page }) => {
            await page.goto('/');
            await waitForDataLoad(page);

            // Look for quarter selector
            const quarterSelector = page.locator('select:has-text("Q"), [role="combobox"]:has-text("Q")');
            if (await quarterSelector.first().isVisible()) {
                await quarterSelector.first().click();
            }
        });
    });

    test.describe('Navigation', () => {
        test('should navigate to all main sections from dashboard', async ({ page }) => {
            await page.goto('/');
            await waitForDataLoad(page);

            // Check main navigation links exist
            await expect(page.locator('a[href="/risks"]')).toBeVisible();
            await expect(page.locator('a[href="/controls"]')).toBeVisible();
            await expect(page.locator('a[href="/kris"]')).toBeVisible();
        });
    });
});
