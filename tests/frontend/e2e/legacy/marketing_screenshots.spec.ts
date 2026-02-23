import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { DEMO_ACCOUNTS, loginAsDemoUser } from '../helpers/login';
import { waitForDataLoad } from '../helpers/wait';

const OUTPUT_DIR = path.resolve(__dirname, '../../../../.planning/phases/100-marketing');

test('capture marketing screenshots', async ({ page }) => {
    test.setTimeout(300000);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // Set viewport to 2560x1440 for high res (User requested "blurry" fix, "don't care about size")
    // Using deviceScaleFactor: 2 for Retina quality
    await page.setViewportSize({ width: 2560, height: 1440 });

    // Login as Risk Manager (has stable access to risk/control/KRI tables used below).
    console.log('Logging in...');
    await loginAsDemoUser(page, DEMO_ACCOUNTS.RISK_MANAGER, { retries: 4, timeout: 20000 });
    console.log('Logged in.');

    // Helper to verify ID based navigation
    const clickFirstRow = async (resource: string) => {
        for (let attempt = 1; attempt <= 3; attempt++) {
            await waitForDataLoad(page, 20000);

            const retryButton = page.getByRole('button', { name: /try again|zkusit znovu/i }).first();
            const hasRetryButton = await retryButton.isVisible().catch(() => false);
            if (hasRetryButton) {
                await Promise.all([
                    page.waitForResponse(
                        (response) =>
                            response.request().method() === 'GET' && response.url().includes('/api/v1/'),
                        { timeout: 20000 }
                    ).catch(() => undefined),
                    retryButton.click(),
                ]);
                continue;
            }

            const firstRow = page.locator('table tbody tr').first();
            const hasRow = await firstRow.isVisible({ timeout: 3000 }).catch(() => false);
            if (hasRow) {
                await firstRow.scrollIntoViewIfNeeded();
                await firstRow.click({ force: true });
                await waitForDataLoad(page, 20000);
                return;
            }
        }

        console.warn(`No visible table rows found for ${resource}; skipping row click.`);
    };

    const screenshots = [
        { name: 'dashboard_operational_insight.png', url: '/', wait: 3000 },

        // Workflow / Approvals
        { name: 'workflow_pending_queue.png', url: '/approvals', wait: 2000 },

        // Risks
        { name: 'risk_register.png', url: '/risks', wait: 2000 },
        {
            name: 'risk_assessment_details.png',
            url: '/risks',
            action: async () => { await clickFirstRow('risks'); },
            wait: 2000
        },

        // Controls
        { name: 'control_definition.png', url: '/controls/new', wait: 2000 },
        {
            name: 'control_details_execution.png',
            url: '/controls',
            action: async () => { await clickFirstRow('controls'); },
            wait: 2000
        },

        // KRIs
        { name: 'risk_appetite_list.png', url: '/kris', wait: 2000 },
        {
            name: 'risk_appetite_kri.png',
            url: '/kris',
            action: async () => { await clickFirstRow('kris'); },
            wait: 2000
        },
        // Using list for details/appetite generic shots if no specific tab
        { name: 'risk_appetite_details.png', url: '/kris', wait: 2000 }, // Maybe reuse or different view?

        // Governance
        { name: 'governance_oversight.png', url: '/governance', wait: 2000 },
        { name: 'governance_uncategorised.png', url: '/governance', wait: 2000 }, // Same page

        // Audit
        { name: 'audit_trail.png', url: '/audit-trail', wait: 2000 },

        // Users
        { name: 'user_management.png', url: '/users', wait: 2000 },

        // Departments
        { name: 'departments_overview.png', url: '/departments', wait: 2000 },
    ];

    const navigateWithRetry = async (url: string): Promise<boolean> => {
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                return true;
            } catch {
                if (attempt === 2) {
                    return false;
                }
            }
        }
        return false;
    };

    for (const s of screenshots) {
        console.log(`Navigating to ${s.url} for ${s.name}`);
        const navigated = await navigateWithRetry(s.url);
        if (!navigated) {
            console.warn(`Navigation failed for ${s.url}; skipping ${s.name}.`);
            continue;
        }
        await waitForDataLoad(page, 20000);

        if (s.action) {
            console.log(`Executing action for ${s.name}`);
            try {
                await s.action();
            } catch {
                console.warn(`Action failed for ${s.name}; capturing current page instead.`);
            }
        }

        if (s.wait) {
            await page.waitForTimeout(s.wait);
        }

        // Ensure all animations settled
        await page.waitForLoadState('networkidle');

        const savePath = path.join(OUTPUT_DIR, s.name);
        console.log(`Saving to ${savePath}`);
        await page.screenshot({ path: savePath, fullPage: false });
    }
});
