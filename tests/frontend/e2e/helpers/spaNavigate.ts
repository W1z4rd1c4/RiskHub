import type { Page } from '@playwright/test';
import { waitForDataLoad } from './wait';

export type NavigateSpaOptions = {
    timeout?: number;
    onFallbackGoto?: (reason: string) => void;
};

function safePathname(url: string): string | null {
    try {
        return new URL(url).pathname;
    } catch {
        return null;
    }
}

async function waitForPathnameChange(page: Page, previousPathname: string, timeout: number): Promise<void> {
    await page.waitForFunction((prev) => window.location.pathname !== prev, previousPathname, { timeout });
}

async function waitForPathname(page: Page, expectedPathname: string, timeout: number): Promise<void> {
    await page.waitForFunction((expected) => window.location.pathname === expected, expectedPathname, { timeout });
}

async function waitForStablePathname(page: Page, timeout: number): Promise<void> {
    const stableForMs = 250;
    const pollMs = 50;
    const deadline = Date.now() + timeout;

    let lastPathname = await page.evaluate(() => window.location.pathname).catch(() => '');
    let stableSince = Date.now();

    while (Date.now() < deadline) {
        await page.waitForTimeout(pollMs);
        const currentPathname = await page.evaluate(() => window.location.pathname).catch(() => '');
        if (currentPathname !== lastPathname) {
            lastPathname = currentPathname;
            stableSince = Date.now();
            continue;
        }
        if (Date.now() - stableSince >= stableForMs) return;
    }
}

async function clickSidebarLink(page: Page, href: string): Promise<boolean> {
    const link = page.locator(`aside a[href="${href}"]`).first();
    if (!(await link.isVisible().catch(() => false))) return false;
    await link.click();
    return true;
}

export async function navigateSpa(page: Page, targetPath: string, opts: NavigateSpaOptions = {}): Promise<void> {
    const timeout = opts.timeout ?? 15000;
    const previousPathname = safePathname(page.url()) ?? '';

    if (previousPathname === targetPath) {
        await waitForDataLoad(page, timeout);
        return;
    }

    try {
        const ensureOnPath = async (path: string) => {
            const currentPathname = safePathname(page.url()) ?? '';
            if (currentPathname === path) return;
            const clicked = await clickSidebarLink(page, path);
            if (!clicked) throw new Error(`no sidebar link for ${path}`);
            await waitForPathname(page, path, timeout);
            await waitForStablePathname(page, timeout);
        };

        const navigatedViaSidebar = await clickSidebarLink(page, targetPath);
        if (navigatedViaSidebar) {
            if (previousPathname) {
                await waitForPathnameChange(page, previousPathname, timeout);
            }
            await waitForStablePathname(page, timeout);
        } else if (targetPath === '/notifications') {
            const bellButton = page.locator('[data-testid="notification-bell-button"]').first();
            if (!(await bellButton.isVisible().catch(() => false))) {
                throw new Error('notification bell not visible');
            }
            await bellButton.click();

            const viewAllButton = page.locator('[data-testid="notification-view-all-button"]').first();
            if (!(await viewAllButton.isVisible().catch(() => false))) {
                throw new Error('notification view-all button not visible');
            }
            await viewAllButton.click();
            await waitForPathname(page, targetPath, timeout);
            await waitForStablePathname(page, timeout);
        } else if (targetPath === '/controls/new') {
            await ensureOnPath('/controls');
            const createButton = page.locator('[data-testid="controls-create-button"]').first();
            if (!(await createButton.isVisible().catch(() => false))) throw new Error('controls create button not visible');
            await createButton.click();
            await waitForPathname(page, targetPath, timeout);
            await waitForStablePathname(page, timeout);
        } else if (targetPath === '/risks/new') {
            await ensureOnPath('/risks');
            const createButton = page.locator('[data-testid="risks-create-button"]').first();
            if (!(await createButton.isVisible().catch(() => false))) throw new Error('risks create button not visible');
            await createButton.click();
            await waitForPathname(page, targetPath, timeout);
            await waitForStablePathname(page, timeout);
        } else if (targetPath === '/issues/new') {
            await ensureOnPath('/issues');
            const createButton = page.locator('[data-testid="issues-create-button"]').first();
            if (!(await createButton.isVisible().catch(() => false))) throw new Error('issues create button not visible');
            await createButton.click();
            await waitForPathname(page, targetPath, timeout);
            await waitForStablePathname(page, timeout);
        } else if (targetPath === '/kris/new') {
            await ensureOnPath('/kris');
            const createButton = page.locator('[data-testid="kris-create-button"]').first();
            if (!(await createButton.isVisible().catch(() => false))) throw new Error('kris create button not visible');
            await createButton.click();
            await waitForPathname(page, targetPath, timeout);
            await waitForStablePathname(page, timeout);
        } else if (targetPath === '/vendors/new') {
            await ensureOnPath('/vendors');
            const createButton = page.locator('[data-testid="vendors-create-button"]').first();
            if (!(await createButton.isVisible().catch(() => false))) throw new Error('vendors create button not visible');
            await createButton.click();
            await waitForPathname(page, targetPath, timeout);
            await waitForStablePathname(page, timeout);
        } else {
            throw new Error(`no SPA navigation strategy for ${targetPath}`);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        opts.onFallbackGoto?.(message);
        await page.goto(targetPath);
    }

    await waitForDataLoad(page, timeout);
}
