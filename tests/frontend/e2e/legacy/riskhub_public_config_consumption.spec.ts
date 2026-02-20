import { test, expect, Page, Request } from '@playwright/test';

/**
 * Tests to verify the frontend consumes public Risk Hub endpoints
 * and uses the correct threshold keys.
 * 
 * This prevents regression to CRO-only endpoints or wrong key names.
 */

// Collect network requests during navigation
async function collectRequestsDuring(page: Page, action: () => Promise<void>): Promise<Request[]> {
    const requests: Request[] = [];
    const handler = (request: Request) => requests.push(request);
    page.on('request', handler);
    await action();
    page.off('request', handler);
    return requests;
}

test.describe('Risk Hub Public Config Consumption', () => {
    test.beforeEach(async ({ page }) => {
        // Login as a non-CRO user (employee)
        await page.goto('/');
        await page.fill('input[name="email"]', 'employee@test.com');
        await page.fill('input[name="password"]', 'password123');
        await page.click('button[type="submit"]');

        // Wait for dashboard to load
        await page.waitForURL('**/dashboard', { timeout: 10000 });
    });

    test('should call public-risk-types endpoint when loading risks page', async ({ page }) => {
        const requests = await collectRequestsDuring(page, async () => {
            await page.goto('/risks');
            await page.waitForLoadState('networkidle');
        });

        const urls = requests.map(r => r.url());

        // Should call the public risk types endpoint
        const publicRiskTypesCall = urls.find(url => url.includes('/api/v1/riskhub/public-risk-types'));
        expect(publicRiskTypesCall).toBeTruthy();

        // Should NOT call the CRO-only risk types endpoint
        const croOnlyCall = urls.find(url =>
            url.includes('/api/v1/riskhub/risk-types') &&
            !url.includes('public-risk-types')
        );
        expect(croOnlyCall).toBeFalsy();
    });

    test('should call public-config with correct threshold keys', async ({ page }) => {
        const requests = await collectRequestsDuring(page, async () => {
            await page.goto('/risks');
            await page.waitForLoadState('networkidle');
        });

        const urls = requests.map(r => r.url());

        // Should call public-config for each threshold key
        const expectedKeys = [
            'critical_risk_min_net_score',
            'high_risk_min_net_score',
            'medium_risk_min_net_score'
        ];

        for (const key of expectedKeys) {
            const hasCall = urls.some(url =>
                url.includes('/api/v1/riskhub/public-config/') &&
                url.includes(key)
            );
            expect(hasCall, `Expected call for key: ${key}`).toBeTruthy();
        }

        // Should NOT call with old wrong keys
        const wrongKeys = [
            'risk_threshold_critical',
            'risk_threshold_high',
            'risk_threshold_medium'
        ];

        for (const wrongKey of wrongKeys) {
            const hasWrongCall = urls.some(url => url.includes(wrongKey));
            expect(hasWrongCall, `Should NOT call wrong key: ${wrongKey}`).toBeFalsy();
        }
    });

    test('risk type badges should use config-driven display (not single letters)', async ({ page }) => {
        await page.goto('/risks');
        await page.waitForLoadState('networkidle');

        // Wait for the table to load
        await page.waitForSelector('table tbody tr', { timeout: 10000 });

        // Get all type badge texts
        const typeBadges = await page.locator('table tbody tr span.uppercase').allTextContents();

        // Filter for type badges (they should have length >= 2, not single letters)
        const typeBadgesFiltered = typeBadges.filter(text => {
            const trimmed = text.trim().toUpperCase();
            // Exclude status badges and score numbers
            return !['ACTIVE', 'MONITORING', 'CLOSED', 'ARCHIVED', 'PENDING'].includes(trimmed) &&
                isNaN(Number(trimmed));
        });

        // At least some should be present
        expect(typeBadgesFiltered.length).toBeGreaterThan(0);

        // All type badges should be 2+ characters (initials or short codes, not single S/O)
        for (const badge of typeBadgesFiltered) {
            const trimmed = badge.trim();
            // Skip if it looks like a status or other content
            if (trimmed.length > 0 && !trimmed.includes(' ')) {
                expect(trimmed.length).toBeGreaterThanOrEqual(2);
            }
        }
    });

    test('risk detail page should use config-driven type display', async ({ page }) => {
        await page.goto('/risks');
        await page.waitForLoadState('networkidle');

        // Click on the first risk to go to detail page
        await page.click('table tbody tr:first-child');

        // Wait for detail page to load
        await page.waitForURL('**/risks/*');
        await page.waitForLoadState('networkidle');

        // Find the Type label and its value
        const typeRow = page.locator('text=Type >> xpath=ancestor::div[contains(@class, "flex")]');
        await expect(typeRow).toBeVisible();

        // The type value should not be just "S" or "O" - should be full display name
        const typeValue = await typeRow.locator('span.uppercase').textContent();
        expect(typeValue).toBeTruthy();
        expect(typeValue!.trim().length).toBeGreaterThan(1);
    });
});
