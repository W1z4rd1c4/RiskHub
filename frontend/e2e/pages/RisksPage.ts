/**
 * Risks Page Object Model
 * Handles Risk list and interaction operations
 */
import { Page, Locator, expect } from '@playwright/test';
import { waitForDataLoad, waitForTableRows } from '../helpers/wait';

export class RisksPage {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    // Locators
    get pageTitle(): Locator {
        return this.page.locator('h1:has-text("Risks"), h1:has-text("Risk Register")');
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
        return this.page.locator('button:has-text("New Risk"), button:has-text("Create"), a:has-text("New Risk")');
    }

    get departmentFilter(): Locator {
        return this.page.locator('[data-testid="department-filter"], select:has-text("Department")');
    }

    get categoryFilter(): Locator {
        return this.page.locator('[data-testid="category-filter"], select:has-text("Category")');
    }

    get paginationControls(): Locator {
        return this.page.locator('[class*="pagination"], nav[aria-label*="pagination"]');
    }

    // Actions
    async navigate(): Promise<void> {
        await this.page.goto('/risks');
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
        await this.tableRows.nth(index).click();
        await this.page.waitForURL(/.*risks\/\d+/);
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
        return await this.tableRows.count();
    }

    async getRowText(index: number): Promise<string> {
        return await this.tableRows.nth(index).textContent() ?? '';
    }

    // Assertions
    async expectTableVisible(): Promise<void> {
        await expect(this.table).toBeVisible();
    }

    async expectRowsLoaded(minRows = 1): Promise<void> {
        await waitForTableRows(this.page, minRows);
    }

    async expectCreateButtonVisible(): Promise<void> {
        await expect(this.createButton).toBeVisible();
    }

    async expectCreateButtonHidden(): Promise<void> {
        await expect(this.createButton).not.toBeVisible();
    }

    async expectEmptyState(): Promise<void> {
        // No rows or empty state message
        const rowCount = await this.tableRows.count();
        expect(rowCount).toBe(0);
    }
}
