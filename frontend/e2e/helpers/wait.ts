/**
 * Wait helper functions for E2E tests
 * Provides reusable wait utilities for common UI states
 */
import { Page, expect } from '@playwright/test';

/**
 * Wait for data loading (skeleton/pulse animations) to complete
 * @param page - Playwright page object
 * @param timeout - Maximum time to wait (default 30s)
 */
export async function waitForDataLoad(page: Page, timeout = 30000): Promise<void> {
    const loadingSelectors = [
        '.animate-pulse',
        '[data-loading="true"]',
        '.w-8.h-8.border-2.border-accent.border-t-transparent.rounded-full.animate-spin',
        '.animate-spin',
    ];

    for (const selector of loadingSelectors) {
        await page.waitForSelector(selector, { state: 'detached', timeout }).catch(() => {
            // Selector may not exist on this screen or may already be gone.
        });
    }
}

/**
 * Wait for table rows to appear
 * @param page - Playwright page object
 * @param minRows - Minimum number of rows expected (default 1)
 * @param timeout - Maximum time to wait (default 30s)
 */
export async function waitForTableRows(
    page: Page,
    minRows = 1,
    timeout = 30000
): Promise<void> {
    await waitForDataLoad(page, timeout);

    // Wait for at least minRows data rows in tables
    const rowLocator = page.locator('table tbody tr');
    await expect(rowLocator.first()).toBeVisible({ timeout });

    if (minRows > 1) {
        await expect(rowLocator).toHaveCount(minRows, { timeout });
    }
}

/**
 * Wait for a toast notification to appear
 * @param page - Playwright page object
 * @param textPattern - Optional text pattern to match in toast
 * @param timeout - Maximum time to wait (default 10s)
 */
export async function waitForToast(
    page: Page,
    textPattern?: string | RegExp,
    timeout = 10000
): Promise<void> {
    const toastSelector = '[role="status"], .toast, [data-sonner-toast]';

    if (textPattern) {
        const pattern = typeof textPattern === 'string' ? new RegExp(textPattern, 'i') : textPattern;
        await expect(page.locator(toastSelector).filter({ hasText: pattern })).toBeVisible({ timeout });
    } else {
        await expect(page.locator(toastSelector).first()).toBeVisible({ timeout });
    }
}

/**
 * Wait for toast to disappear
 * @param page - Playwright page object
 * @param timeout - Maximum time to wait (default 10s)
 */
export async function waitForToastDismiss(page: Page, timeout = 10000): Promise<void> {
    const toastSelector = '[role="status"], .toast, [data-sonner-toast]';
    await page.waitForSelector(toastSelector, { state: 'detached', timeout }).catch(() => {
        // Toast already gone
    });
}

/**
 * Wait for navigation to complete after clicking a link
 * @param page - Playwright page object
 * @param urlPattern - URL pattern to wait for
 * @param timeout - Maximum time to wait (default 15s)
 */
export async function waitForNavigation(
    page: Page,
    urlPattern: string | RegExp,
    timeout = 15000
): Promise<void> {
    await page.waitForURL(urlPattern, { timeout });
    await waitForDataLoad(page, timeout);
}

/**
 * Wait for modal/dialog to appear
 * @param page - Playwright page object  
 * @param timeout - Maximum time to wait (default 5s)
 */
export async function waitForModal(page: Page, timeout = 5000): Promise<void> {
    await expect(page.locator('[data-testid="link-management-dialog"], [role="dialog"], [role="alertdialog"], .modal')).toBeVisible({ timeout });
}

/**
 * Wait for modal/dialog to close
 * @param page - Playwright page object
 * @param timeout - Maximum time to wait (default 5s)
 */
export async function waitForModalClose(page: Page, timeout = 5000): Promise<void> {
    await page.waitForSelector('[data-testid="link-management-dialog"], [role="dialog"], [role="alertdialog"], .modal', {
        state: 'detached',
        timeout
    }).catch(() => {
        // Modal already gone
    });
}

/**
 * Wait for a table row containing text to become visible.
 * Returns false when row does not appear within timeout.
 */
export async function waitForTableRowByText(
    page: Page,
    text: string,
    timeout = 10000
): Promise<boolean> {
    await waitForDataLoad(page, timeout);
    const row = page.locator('table tbody tr').filter({ hasText: text }).first();
    return await row.isVisible({ timeout }).catch(() => false);
}
