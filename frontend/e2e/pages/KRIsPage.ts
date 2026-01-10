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
        return this.page.locator('input[placeholder*="Search"], input[type="search"]');
    }

    get createButton(): Locator {
        return this.page.locator('button:has-text("New KRI"), button:has-text("Create"), a:has-text("New KRI")');
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
        await waitForDataLoad(this.page);
    }

    async search(query: string): Promise<void> {
        await this.searchInput.fill(query);
        await this.page.waitForTimeout(500); // Debounce
        await waitForDataLoad(this.page);
    }

    async clearSearch(): Promise<void> {
        await this.searchInput.clear();
        await this.page.waitForTimeout(500);
        await waitForDataLoad(this.page);
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

    async clickCreateButton(): Promise<void> {
        await this.createButton.click();
        await waitForDataLoad(this.page);
    }

    async getRowCount(): Promise<number> {
        await waitForDataLoad(this.page);
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
        await waitForDataLoad(this.page);
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
