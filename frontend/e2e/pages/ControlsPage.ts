/**
 * Controls Page Object Model
 * Handles Control list and interaction operations
 */
import { Page, Locator, expect } from '@playwright/test';
import { waitForDataLoad, waitForTableRows } from '../helpers/wait';

export class ControlsPage {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    // Locators
    get pageTitle(): Locator {
        return this.page.locator('h1:has-text("Controls"), h1:has-text("Control Catalog")');
    }

    get table(): Locator {
        return this.page.locator('table').first();
    }

    get tableRows(): Locator {
        return this.table.locator('tbody tr');
    }

    get searchInput(): Locator {
        return this.page.locator(
            '[data-testid="search-input"], ' +
            'input[placeholder*="Search"], ' +
            'input[placeholder*="Hledat"], ' +
            'input[aria-label*="Search"], ' +
            'input[aria-label*="Hledat"], ' +
            'input[type="search"]'
        ).first();
    }

    get createButton(): Locator {
        return this.page.locator('button:has-text("New Control"), button:has-text("Create"), a:has-text("New Control")');
    }

    get departmentFilter(): Locator {
        return this.page.locator('[data-testid="department-filter"], select:has-text("Department")');
    }

    get statusFilter(): Locator {
        return this.page.locator('[data-testid="status-filter"], select:has-text("Status")');
    }

    get statusSelectTrigger(): Locator {
        return this.page.locator('[role="combobox"]').first();
    }

    get paginationControls(): Locator {
        return this.page.locator('[class*="pagination"], nav[aria-label*="pagination"]');
    }

    // Actions
    async navigate(): Promise<void> {
        await this.page.goto('/controls');
        await waitForDataLoad(this.page);
    }

    async search(query: string): Promise<void> {
        await expect(this.searchInput).toBeVisible({ timeout: 10000 });
        await this.searchInput.fill(query);
        const normalizedQuery = query.trim().toLowerCase();
        await Promise.all([
            this.page.waitForResponse((response) => {
                if (response.request().method() !== 'GET') return false;
                if (!response.url().includes('/api/v1/controls')) return false;
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
        await waitForDataLoad(this.page);
    }

    async clearSearch(): Promise<void> {
        await this.searchInput.clear();
        await this.page.waitForTimeout(500);
        await waitForDataLoad(this.page);
    }

    async clickRow(index: number): Promise<void> {
        await this.tableRows.nth(index).click();
        await this.page.waitForURL(/.*controls\/\d+/);
        await waitForDataLoad(this.page);
    }

    async clickFirstRow(): Promise<void> {
        await this.clickRow(0);
    }

    rowByText(text: string): Locator {
        return this.tableRows.filter({ hasText: text }).first();
    }

    async openRowByText(text: string): Promise<void> {
        const row = this.rowByText(text);
        try {
            await expect(row).toBeVisible({ timeout: 10000 });
        } catch {
            throw new Error(`Control row not found for deterministic fixture: ${text}`);
        }
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await this.rowByText(text).click({ timeout: 8000 });
                await this.page.waitForURL(/.*controls\/\d+/, { timeout: 10000 });
                await waitForDataLoad(this.page);
                return;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const detached = message.includes('detached from the DOM');
                if (!detached || attempt === 3) {
                    throw error;
                }
                await waitForDataLoad(this.page);
            }
        }
    }

    async clickCreateButton(): Promise<void> {
        await this.createButton.click();
        await waitForDataLoad(this.page);
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
        const rowCount = await this.tableRows.count();
        expect(rowCount).toBe(0);
    }
}
