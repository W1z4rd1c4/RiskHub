import { expect, Page, test, type Response } from '@playwright/test';
import fs from 'fs';
import path from 'path';

import { DEMO_ACCOUNTS, loginAsDemoUser } from './helpers/login';
import { waitForDataLoad } from './helpers/wait';

const OUTPUT_DIR = path.resolve(__dirname, '../../../docs/assets/readme');
const STANDARD_VIEWPORT = { width: 1600, height: 1000 };
const HERO_VIEWPORT = { width: 1600, height: 1100 };
const SOCIAL_VIEWPORT = { width: 1280, height: 640 };

test.skip(
    process.env.CAPTURE_README_SCREENSHOTS !== '1',
    'README screenshot capture is opt-in so normal E2E runs do not rewrite tracked assets.',
);

test.describe.configure({ mode: 'serial' });
test.setTimeout(180000);

async function stabilizeForScreenshot(page: Page) {
    await waitForDataLoad(page, 30000);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined);
    await page.addStyleTag({
        content: `
            [data-sonner-toaster],
            [data-testid="notification-dropdown-panel"],
            [role="status"] {
                display: none !important;
            }
        `,
    }).catch(() => undefined);
    await page.waitForTimeout(750);
}

function waitForDashboardOverview(page: Page): Promise<Response> {
    return page.waitForResponse(
        (response) => response.url().includes('/api/v1/dashboard/overview') && response.request().method() === 'GET',
        { timeout: 30000 }
    );
}

async function assertIssueDashboardDataReady(response: Response) {
    expect(response.ok(), 'README dashboard captures require a successful dashboard overview response').toBeTruthy();

    const overview = await response.json();
    const openIssues = Number(overview?.issue_summary?.open_issues ?? 0);
    const agingTotal = (overview?.issue_aging?.buckets ?? []).reduce(
        (sum: number, bucket: { count?: number }) => sum + Number(bucket.count ?? 0),
        0
    );
    const severityTotal = (overview?.issue_severity?.items ?? []).reduce(
        (sum: number, item: { count?: number }) => sum + Number(item.count ?? 0),
        0
    );

    expect(openIssues, 'README dashboard captures require seeded open issues').toBeGreaterThan(0);
    expect(agingTotal, 'README dashboard captures require a non-empty issue aging chart').toBeGreaterThan(0);
    expect(severityTotal, 'README dashboard captures require a non-empty issue severity chart').toBeGreaterThan(0);
}

async function capturePage(page: Page, url: string, fileName: string) {
    const overviewResponse = url === '/' ? waitForDashboardOverview(page) : null;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await stabilizeForScreenshot(page);
    if (overviewResponse) {
        await assertIssueDashboardDataReady(await overviewResponse);
    }
    await page.screenshot({
        path: path.join(OUTPUT_DIR, fileName),
        fullPage: false,
    });
}

async function captureDashboardHero(page: Page) {
    const overviewResponse = waitForDashboardOverview(page);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await stabilizeForScreenshot(page);
    await expect(page.locator('.recharts-wrapper').first()).toBeVisible({ timeout: 30000 });
    await assertIssueDashboardDataReady(await overviewResponse);
    await page.locator('main').evaluate((main) => {
        main.scrollTop = 120;
    });
    await page.waitForTimeout(750);
    await page.screenshot({
        path: path.join(OUTPUT_DIR, 'hero-dashboard.png'),
        fullPage: false,
    });
}

async function clickFirstTableRow(page: Page, resourceName: string) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        await waitForDataLoad(page, 30000);
        const firstRow = page.locator('table tbody tr').filter({ has: page.locator('td') }).first();
        await expect(firstRow, `Expected seeded ${resourceName} rows for README screenshot capture`).toBeVisible({
            timeout: 30000,
        });
        try {
            await firstRow.click({ force: true });
            await stabilizeForScreenshot(page);
            return;
        } catch (error) {
            if (attempt === 3) {
                throw error;
            }
            await page.waitForTimeout(500);
        }
    }
}

test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
});

test('capture social preview', async ({ page }) => {
    await page.setViewportSize(SOCIAL_VIEWPORT);
    await loginAsDemoUser(page, DEMO_ACCOUNTS.RISK_MANAGER, { retries: 4, timeout: 20000 });
    await capturePage(page, '/', 'social-preview.png');
});

test('capture business workflow screenshots', async ({ page }) => {
    await page.setViewportSize(STANDARD_VIEWPORT);
    await loginAsDemoUser(page, DEMO_ACCOUNTS.RISK_MANAGER, { retries: 4, timeout: 20000 });

    await page.setViewportSize(HERO_VIEWPORT);
    await captureDashboardHero(page);

    await page.setViewportSize(STANDARD_VIEWPORT);
    await capturePage(page, '/risks', 'risk-register.png');

    await page.goto('/risks', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await clickFirstTableRow(page, 'risk');
    await page.waitForURL(/\/risks\/[^/]+$/, { timeout: 30000 }).catch(() => undefined);
    await stabilizeForScreenshot(page);
    await page.screenshot({
        path: path.join(OUTPUT_DIR, 'risk-detail-linked-work.png'),
        fullPage: false,
    });

    await page.goto('/vendors', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await clickFirstTableRow(page, 'vendor');
    await page.waitForURL(/\/vendors\/[^/]+$/, { timeout: 30000 }).catch(() => undefined);
    await stabilizeForScreenshot(page);
    await page.screenshot({
        path: path.join(OUTPUT_DIR, 'vendor-linked-context.png'),
        fullPage: false,
    });

    await capturePage(page, '/approvals', 'approvals-workflow.png');
});

test('capture governance workflow screenshots', async ({ page }) => {
    await page.setViewportSize(STANDARD_VIEWPORT);
    await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO, { retries: 4, timeout: 20000 });

    await capturePage(page, '/governance', 'governance-queue.png');
    await capturePage(page, '/risk-hub', 'risk-hub-configuration.png');
});

test('capture admin operations screenshot', async ({ page }) => {
    await page.setViewportSize(STANDARD_VIEWPORT);
    await loginAsDemoUser(page, DEMO_ACCOUNTS.ADMIN, { retries: 4, timeout: 20000 });

    await capturePage(page, '/admin', 'admin-console-ops.png');
});
