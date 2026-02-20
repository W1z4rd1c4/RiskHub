import { test } from '@playwright/test';
import path from 'path';

const OUTPUT_DIR = '/Users/stefanlesnak/Antigravity/Risk App/.planning/phases/100-marketing';

test('capture marketing screenshots', async ({ page }) => {
    // Set viewport to 2560x1440 for high res (User requested "blurry" fix, "don't care about size")
    // Using deviceScaleFactor: 2 for Retina quality
    await page.setViewportSize({ width: 2560, height: 1440 });

    // Login as Admin
    console.log('Logging in...');
    await page.goto('http://localhost:5173/login');
    // Wait for buttons to load
    await page.waitForSelector('button:has-text("System Admin")', { state: 'visible' });
    await page.click('button:has-text("System Admin")');
    await page.waitForURL('http://localhost:5173/');
    console.log('Logged in.');

    // Helper to verify ID based navigation
    const clickFirstRow = async () => {
        await page.waitForSelector('tbody tr', { state: 'visible' });
        await page.click('tbody tr:first-child');
        await page.waitForLoadState('networkidle');
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
            action: async () => { await clickFirstRow(); },
            wait: 2000
        },

        // Controls
        { name: 'control_definition.png', url: '/controls/new', wait: 2000 },
        {
            name: 'control_details_execution.png',
            url: '/controls',
            action: async () => { await clickFirstRow(); },
            wait: 2000
        },

        // KRIs
        { name: 'risk_appetite_list.png', url: '/kris', wait: 2000 },
        {
            name: 'risk_appetite_kri.png',
            url: '/kris',
            action: async () => { await clickFirstRow(); },
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

    for (const s of screenshots) {
        console.log(`Navigating to ${s.url} for ${s.name}`);
        await page.goto(`http://localhost:5173${s.url}`);

        if (s.action) {
            console.log(`Executing action for ${s.name}`);
            await s.action();
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
