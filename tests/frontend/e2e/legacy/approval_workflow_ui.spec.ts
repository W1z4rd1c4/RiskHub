
import { test, expect } from '@playwright/test';

test('Approval Workflow UI Verification', async ({ page }) => {
    // 1. Login as Employee
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="email"]', 'ops.employee@riskhub.test');
    await page.fill('input[type="password"]', 'test123');
    await page.click('button[type="submit"]');

    // Wait for dashboard
    await expect(page).toHaveURL('http://localhost:5173/');

    // 2. Navigate to Risks
    await page.click('a[href="/risks"]');
    await expect(page).toHaveURL(/.*risks/);

    // 3. Wait for skeletons to disappear and data to load
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 30000 });

    // Wait for at least one risk row
    await page.waitForSelector('table tbody tr:not(.animate-pulse)');
    const firstRiskRow = page.locator('table tbody tr').first();
    await firstRiskRow.click();

    // 4. Request deletion on Detail Page
    await page.waitForSelector('.lucide-trash-2');

    // Handle the window.confirm dialog
    page.on('dialog', async dialog => {
        await dialog.accept();
    });

    await page.click('button:has(.lucide-trash-2)');

    // 5. Verify "Pending" badge on Risks page
    await page.waitForURL(/.*risks/);
    await page.waitForSelector('.animate-pulse', { state: 'detached' });
    await page.waitForSelector('text=Pending', { timeout: 10000 });
    await expect(page.locator('text=Pending').first()).toBeVisible();

    // 6. Logout
    await page.click('button:has(.lucide-log-out)');

    // 7. Login as Risk Manager
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="email"]', 'risk.manager@riskhub.test');
    await page.fill('input[type="password"]', 'test123');
    await page.click('button[type="submit"]');

    // 8. Go to Approvals
    await page.click('a[href="/approvals"]');
    await expect(page.locator('text=Workflow')).toBeVisible();

    // 9. Find the request and approve
    await page.waitForSelector('button:has(.lucide-check)');
    await page.click('button:has(.lucide-check)');

    // Fill resolution notes in dialog
    await page.waitForSelector('textarea[placeholder*="notes"]');
    await page.fill('textarea[placeholder*="notes"]', 'UI verification: Approved');
    await page.click('button:has-text("Approve")');

    // 10. Verify risk "Pending" tag is removed
    await page.goto('http://localhost:5173/risks');
    await page.waitForSelector('.animate-pulse', { state: 'detached' });
    await expect(page.locator('text=Pending')).not.toBeVisible();
});
