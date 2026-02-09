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
        return this.page.locator(
            [
                '[data-testid="search-input"]',
                'input[placeholder*="Search"]',
                'input[placeholder*="Hledat"]',
                'input[aria-label*="Search"]',
                'input[aria-label*="Hledat"]',
                'input[type="search"]',
            ].join(', ')
        ).first();
    }

    get createButton(): Locator {
        return this.page.locator('button:has-text("New Risk"), button:has-text("Create"), a:has-text("New Risk")');
    }

    get includeArchivedCheckbox(): Locator {
        return this.page.locator('label:has(input[type="checkbox"]) input[type="checkbox"]').first();
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

    get statusSelectTrigger(): Locator {
        return this.page.locator('[role="combobox"]').first();
    }

    // Actions
    async navigate(): Promise<void> {
        await this.page.goto('/risks');
        await this.waitForListReady();
    }

    async waitForListReady(timeout = 15000): Promise<void> {
        await waitForDataLoad(this.page, timeout);
        await Promise.race([
            this.table.waitFor({ state: 'visible', timeout }),
            this.page.locator('[class*="card"], [class*="Card"]').first().waitFor({ state: 'visible', timeout }),
        ]).catch(() => undefined);
    }

    async search(query: string): Promise<void> {
        await expect(this.searchInput).toBeVisible({ timeout: 10000 });
        await this.searchInput.fill(query);
        await this.page.waitForTimeout(500); // Debounce
        await this.waitForListReady();
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

    rowByText(text: string): Locator {
        return this.tableRows.filter({ hasText: text }).first();
    }

    async openRowByText(text: string): Promise<void> {
        let row = this.rowByText(text);
        const visibleWithoutSearch = await row.isVisible({ timeout: 3000 }).catch(() => false);
        if (!visibleWithoutSearch) {
            await this.search(text);
            row = this.rowByText(text);
        }
        try {
            await expect(row).toBeVisible({ timeout: 10000 });
        } catch {
            throw new Error(`Risk row not found for deterministic fixture: ${text}`);
        }
        await row.click();
        await this.page.waitForURL(/.*risks\/\d+/);
        await waitForDataLoad(this.page);
    }

    async clickCreateButton(): Promise<void> {
        await this.createButton.click();
        await waitForDataLoad(this.page);
    }

    async setIncludeArchived(enabled: boolean): Promise<void> {
        const currentState = await this.includeArchivedCheckbox.isChecked();
        if (currentState !== enabled) {
            await this.includeArchivedCheckbox.click();
            await waitForDataLoad(this.page);
        }
    }

    async setStatusFilterArchived(): Promise<void> {
        await this.statusSelectTrigger.click();
        await this.page.locator('[role="option"]').filter({ hasText: /archived|archiv/i }).first().click();
        await waitForDataLoad(this.page);
    }

    async clickUnarchiveForRow(text: string): Promise<void> {
        const row = this.rowByText(text);
        await row.locator('button:has-text("Unarchive"), button:has-text("Obnov")').first().click();
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
