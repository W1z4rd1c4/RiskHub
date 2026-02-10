/**
 * KRIs Page Object Model
 * Handles Key Risk Indicator list and interaction operations
 */
import { Page, Locator, expect } from '@playwright/test';
import { waitForDataLoad } from '../helpers/wait';

export class KRIsPage {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    // Locators
    get pageTitle(): Locator {
        return this.page.locator('h1:has-text("Risk Appetite"), h1:has-text("KRI"), h1:has-text("Key Risk Indicator")');
    }

    get table(): Locator {
        return this.page.locator('table').first();
    }

    get tableRows(): Locator {
        return this.table.locator('tbody tr');
    }

    get searchInput(): Locator {
        return this.page.locator(
            [
                '[data-testid="kri-search-input"]',
                'input[placeholder*="Search"]',
                'input[placeholder*="Hledat"]',
                'input[aria-label*="Search"]',
                'input[aria-label*="Hledat"]',
                'input[type="search"]',
            ].join(', ')
        ).first();
    }

    get createButton(): Locator {
        return this.page.locator(
            [
                'button:has-text("New KRI")',
                'button:has-text("Nový KRI")',
                'button:has-text("Nové KRI")',
                'a:has-text("New KRI")',
                'a:has-text("Nový KRI")',
                'a:has-text("Nové KRI")',
                '[href="/kris/new"]',
            ].join(', ')
        ).first();
    }

    get statusFilter(): Locator {
        return this.page.locator('[data-testid="status-filter"], select:has-text("Status")');
    }

    get breachFilter(): Locator {
        return this.page.locator('[data-testid="breach-filter"], button:has-text("Breached")');
    }

    get paginationControls(): Locator {
        return this.page.locator('[class*="pagination"], nav[aria-label*="pagination"]');
    }

    // Grid/Card view if applicable
    get gridView(): Locator {
        return this.page.locator('.grid, [role="grid"]');
    }

    get cards(): Locator {
        return this.page.locator('[class*="card"], [class*="Card"]');
    }

    // Actions
    async navigate(): Promise<void> {
        await this.page.goto('/kris');
        await this.waitForListReady();
    }

    async waitForListReady(timeout = 15000): Promise<void> {
        await waitForDataLoad(this.page, timeout);
        await Promise.race([
            this.table.waitFor({ state: 'visible', timeout }),
            this.gridView.first().waitFor({ state: 'visible', timeout }),
        ]).catch(() => undefined);
    }

    async search(query: string): Promise<void> {
        await expect(this.searchInput).toBeVisible({ timeout: 10000 });
        await this.searchInput.fill(query);
        const normalizedQuery = query.trim().toLowerCase();
        await Promise.all([
            this.page.waitForResponse((response) => {
                if (response.request().method() !== 'GET') return false;
                if (!response.url().includes('/api/v1/kris')) return false;
                if (!normalizedQuery) return true;
                try {
                    const url = new URL(response.url());
                    const searchParam = (url.searchParams.get('search') || '').toLowerCase();
                    return searchParam.includes(normalizedQuery);
                } catch {
                    return false;
                }
            }, { timeout: 15000 }).catch(() => undefined),
            this.page.waitForTimeout(500), // Debounce + request dispatch
        ]);
        await this.waitForListReady();
    }

    async clearSearch(): Promise<void> {
        await this.searchInput.clear();
        await this.page.waitForTimeout(500);
        await this.waitForListReady();
    }

    async clickRow(index: number): Promise<void> {
        // Try table first, then grid
        const tableRowCount = await this.tableRows.count();
        if (tableRowCount > 0) {
            await this.tableRows.nth(index).click();
        } else {
            await this.cards.nth(index).click();
        }
        await this.page.waitForURL(/.*kris\/\d+/);
        await waitForDataLoad(this.page);
    }

    async clickFirstRow(): Promise<void> {
        await this.clickRow(0);
    }

    rowByText(text: string): Locator {
        const tableRow = this.tableRows.filter({ hasText: text }).first();
        return tableRow;
    }

    async openRowByText(text: string): Promise<void> {
        await this.waitForListReady();
        const row = this.rowByText(text);
        await row.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
        const rowVisible = await row.isVisible().catch(() => false);
        if (rowVisible) {
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    await this.rowByText(text).click({ timeout: 8000 });
                    break;
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    const detached = message.includes('detached from the DOM');
                    if (!detached || attempt === 3) throw error;
                    await this.waitForListReady();
                }
            }
        } else {
            const card = this.cards.filter({ hasText: text }).first();
            const cardVisible = await card.isVisible().catch(() => false);
            if (!cardVisible) {
                throw new Error(`KRI row not found for deterministic fixture: ${text}`);
            }
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    await this.cards.filter({ hasText: text }).first().click({ timeout: 8000 });
                    break;
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    const detached = message.includes('detached from the DOM');
                    if (!detached || attempt === 3) throw error;
                    await this.waitForListReady();
                }
            }
        }
        await this.page.waitForURL(/.*kris\/\d+/);
        await waitForDataLoad(this.page);
    }

    async clickCreateButton(): Promise<void> {
        await this.createButton.click();
        await waitForDataLoad(this.page);
    }

    async setStatusFilterArchived(): Promise<void> {
        await this.page.locator('button').filter({ hasText: /archived|archiv/i }).first().click();
        await this.waitForListReady();
    }

    async clickUnarchiveForRow(text: string): Promise<void> {
        const row = this.rowByText(text);
        const rowVisible = await row.isVisible().catch(() => false);
        if (rowVisible) {
            await row.locator('button:has-text("Unarchive"), button:has-text("Obnov")').first().click();
        } else {
            await this.cards
                .filter({ hasText: text })
                .first()
                .locator('button:has-text("Unarchive"), button:has-text("Obnov")')
                .first()
                .click();
        }
        await waitForDataLoad(this.page);
    }

    async getRowCount(): Promise<number> {
        await this.waitForListReady();
        const tableRowCount = await this.tableRows.count();
        if (tableRowCount > 0) return tableRowCount;
        return await this.cards.count();
    }

    async getRowText(index: number): Promise<string> {
        const tableRowCount = await this.tableRows.count();
        if (tableRowCount > 0) {
            return await this.tableRows.nth(index).textContent() ?? '';
        }
        return await this.cards.nth(index).textContent() ?? '';
    }

    // Assertions
    async expectContentVisible(): Promise<void> {
        // Either table or grid should be visible
        const tableVisible = await this.table.isVisible().catch(() => false);
        const gridVisible = await this.gridView.isVisible().catch(() => false);
        expect(tableVisible || gridVisible).toBe(true);
    }

    async expectRowsLoaded(minRows = 1): Promise<void> {
        await this.waitForListReady();
        const count = await this.getRowCount();
        expect(count).toBeGreaterThanOrEqual(minRows);
    }

    async expectCreateButtonVisible(): Promise<void> {
        await expect(this.createButton).toBeVisible();
    }

    async expectCreateButtonHidden(): Promise<void> {
        await expect(this.createButton).not.toBeVisible();
    }

    async expectEmptyState(): Promise<void> {
        const count = await this.getRowCount();
        expect(count).toBe(0);
    }
}
