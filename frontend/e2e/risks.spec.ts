/**
 * Risk Management E2E Tests
 * Uses demo account picker for login
 */
import { test, expect, Page } from '@playwright/test';

async function loginAsDemoUser(page: Page, accountName: string, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await page.goto('/login');
            await page.waitForSelector(`button:has-text("${accountName}")`, { timeout: 15000 });
            await page.click(`button:has-text("${accountName}")`);
            await page.waitForURL(/^http:\/\/localhost:5173\/(dashboard|admin|risks|$)/, { timeout: 20000 });
            // Verify we're actually logged in by checking for nav element
            await page.waitForSelector('nav', { timeout: 10000 });
            return; // Success
        } catch (error) {
            if (attempt === retries) throw error;
            await page.waitForTimeout(500 * attempt); // Backoff
        }
    }
}

async function waitForDataLoad(page: Page) {
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 30000 }).catch(() => { });
}

async function openRiskDetailByRow(page: Page, rowIndex = 0): Promise<string | null> {
    await page.goto('/risks');
    await waitForDataLoad(page);

    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();
    if (rowCount <= rowIndex) {
        return null;
    }

    await rows.nth(rowIndex).click();
    await page.waitForURL(/\/risks\/\d+/, { timeout: 15000 });
    await waitForDataLoad(page);

    const match = page.url().match(/\/risks\/(\d+)/);
    return match?.[1] ?? null;
}

async function openRiskDetailWithKri(page: Page, maxRowsToTry = 8): Promise<boolean> {
    for (let i = 0; i < maxRowsToTry; i++) {
        const openedRiskId = await openRiskDetailByRow(page, i);
        if (!openedRiskId) {
            return false;
        }

        const noKriMessage = page.getByText('No Key Risk Indicators (KRIs) configured for this risk.');
        const hasNoKriMessage = await noKriMessage.isVisible().catch(() => false);
        if (hasNoKriMessage) {
            continue;
        }

        const kriSection = page.locator('div.glass-card').filter({
            has: page.getByRole('heading', { name: /risk appetite indicators/i }),
        }).first();
        const hasKriCard = await kriSection.locator('h4').first().isVisible().catch(() => false);
        if (hasKriCard) {
            return true;
        }
    }

    return false;
}

test.describe('Risk Management', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsDemoUser(page, 'Petra Svobodová');
    });

    test.describe('Risk List', () => {
        test('should display risks list', async ({ page }) => {
            await page.goto('/risks');
            await waitForDataLoad(page);

            // Should show table with risks - wait for actual data rows
            await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10000 });
        });

        test('should search risks', async ({ page }) => {
            await page.goto('/risks');
            await waitForDataLoad(page);

            // Find search input
            const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]');
            if (await searchInput.isVisible()) {
                await searchInput.fill('test');
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
            if (await firstRow.isVisible()) {
                await firstRow.click();
                // Should show risk details
                await expect(page.locator('h1, h2').first()).toBeVisible();
            }
        });

        test('should navigate to KRI full page when KRI card is clicked', async ({ page }) => {
            const hasKri = await openRiskDetailWithKri(page);
            if (!hasKri) {
                test.skip();
                return;
            }

            const kriSection = page.locator('div.glass-card').filter({
                has: page.getByRole('heading', { name: /risk appetite indicators/i }),
            }).first();
            await kriSection.locator('h4').first().click();

            await page.waitForURL(/\/kris\/\d+/, { timeout: 15000 });
            await expect(page).toHaveURL(/\/kris\/\d+/);
        });

        test('should navigate to KRI new page with risk_id when Add KRI is clicked', async ({ page }) => {
            const riskId = await openRiskDetailByRow(page, 0);
            if (!riskId) {
                test.skip();
                return;
            }

            const addKriButton = page.getByRole('button', { name: /add kri/i });
            const canAddKri = await addKriButton.isVisible().catch(() => false);
            if (!canAddKri) {
                test.skip();
                return;
            }

            await addKriButton.click();
            await page.waitForURL(/\/kris\/new(\?.*)?$/, { timeout: 15000 });

            const url = new URL(page.url());
            expect(url.pathname).toBe('/kris/new');
            expect(url.searchParams.get('risk_id')).toBe(riskId);
        });
    });
});
