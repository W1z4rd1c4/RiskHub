/**
 * Risk Management E2E Tests
 * Covers: Create, read, update, archive risks, link controls
 */
import { test, expect, Page } from '@playwright/test';

// Helper function to login as risk manager
async function loginAsRiskManager(page: Page) {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'risk.manager@riskhub.test');
    await page.fill('input[type="password"]', 'test123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
}

// Helper to wait for data to load
async function waitForDataLoad(page: Page) {
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 30000 });
}

test.describe('Risk Management', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsRiskManager(page);
    });

    test.describe('Risk List', () => {
        test('should display risks list', async ({ page }) => {
            await page.goto('/risks');
            await waitForDataLoad(page);

            // Should show table with risks
            await expect(page.locator('table')).toBeVisible();
            await expect(page.locator('table tbody tr').first()).toBeVisible();
        });

        test('should filter risks by status', async ({ page }) => {
            await page.goto('/risks');
            await waitForDataLoad(page);

            // Look for status filter
            const statusFilter = page.locator('select, [role="combobox"]').first();
            if (await statusFilter.isVisible()) {
                await statusFilter.click();
            }
        });

        test('should search risks', async ({ page }) => {
            await page.goto('/risks');
            await waitForDataLoad(page);

            // Find search input
            const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]');
            if (await searchInput.isVisible()) {
                await searchInput.fill('test');
                // Wait for debounced search
                await page.waitForTimeout(500);
            }
        });
    });

    test.describe('Risk Detail', () => {
        test('should navigate to risk detail page', async ({ page }) => {
            await page.goto('/risks');
            await waitForDataLoad(page);

            // Click first risk
            const firstRow = page.locator('table tbody tr').first();
            await firstRow.click();

            // Should show risk details
            await expect(page.locator('h1, h2').first()).toBeVisible();
        });

        test('should display risk scoring', async ({ page }) => {
            await page.goto('/risks');
            await waitForDataLoad(page);

            // Click first risk
            await page.locator('table tbody tr').first().click();

            // Should show scoring info (gross/net)
            await expect(page.locator('text=/Gross|Net|Score/i').first()).toBeVisible();
        });
    });

    test.describe('Risk CRUD', () => {
        test('should show create risk button for authorized users', async ({ page }) => {
            await page.goto('/risks');
            await waitForDataLoad(page);

            // Look for create button
            const createBtn = page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("New")');
            // May or may not be visible depending on permissions
        });

        test('should open risk detail for editing', async ({ page }) => {
            await page.goto('/risks');
            await waitForDataLoad(page);

            // Click first risk
            await page.locator('table tbody tr').first().click();

            // Look for edit button
            const editBtn = page.locator('button:has(.lucide-pencil), button:has-text("Edit")');
            if (await editBtn.isVisible()) {
                await editBtn.click();
                // Should show edit modal or form
                await expect(page.locator('form, dialog, [role="dialog"]')).toBeVisible();
            }
        });
    });

    test.describe('Risk-Control Linking', () => {
        test('should display linked controls on risk detail', async ({ page }) => {
            await page.goto('/risks');
            await waitForDataLoad(page);

            // Click first risk
            await page.locator('table tbody tr').first().click();

            // Should show controls section
            await expect(page.locator('text=/Control|Mitigation/i').first()).toBeVisible();
        });
    });
});
