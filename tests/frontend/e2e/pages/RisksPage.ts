/**
 * Risks Page Object Model
 * Handles Risk list and interaction operations
 */
import { expect, Locator, Page } from '@playwright/test';
import { waitForDataLoad, waitForTableRows } from '../helpers/wait';

export class RisksPage {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    // Locators
    get pageTitle(): Locator {
        return this.page.locator('h2');
    }

    get table(): Locator {
        return this.page.locator('table').first();
    }

    get tableRows(): Locator {
        return this.table.locator('tbody tr');
    }

    get searchInput(): Locator {
        return this.page.getByTestId('risks-search-input');
    }

    get createButton(): Locator {
        return this.page.getByTestId('risks-create-button');
    }

    get statusSelectTrigger(): Locator {
        return this.page.getByTestId('risks-status-filter-trigger');
    }

    get exportButton(): Locator {
        return this.page.getByTestId('risks-export-button');
    }

    get exportDialog(): Locator {
        return this.page.getByTestId('risks-export-dialog');
    }

    get exportFormatTrigger(): Locator {
        return this.page.getByTestId('export-format-trigger');
    }

    get exportDateInput(): Locator {
        return this.page.getByTestId('export-date-input');
    }

    get paginationControls(): Locator {
        return this.page.locator('[class*="pagination"], nav[aria-label*="pagination"]');
    }

    private async waitForRisksResponse(expected: { search?: string; status?: string } = {}): Promise<void> {
        await this.page.waitForResponse((response) => {
            if (response.request().method() !== 'GET') return false;
            if (!response.url().includes('/api/v1/risks')) return false;

            try {
                const url = new URL(response.url());
                if (expected.search !== undefined) {
                    const actualSearch = (url.searchParams.get('search') || '').trim().toLowerCase();
                    if (!actualSearch.includes(expected.search.trim().toLowerCase())) return false;
                }
                if (expected.status !== undefined) {
                    const actualStatus = (url.searchParams.get('status') || '').trim().toLowerCase();
                    if (!actualStatus.includes(expected.status.trim().toLowerCase())) return false;
                }
                return true;
            } catch {
                return false;
            }
        }, { timeout: 15000 });
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
        const currentValue = await this.searchInput.inputValue();
        if (currentValue === query) {
            await this.waitForListReady();
            return;
        }
        await Promise.all([
            this.waitForRisksResponse({ search: query }),
            this.searchInput.fill(query),
        ]);
        await this.waitForListReady();
    }

    async clearSearch(): Promise<void> {
        const currentValue = await this.searchInput.inputValue();
        if (currentValue.length === 0) {
            await waitForDataLoad(this.page);
            return;
        }
        await Promise.all([
            this.waitForRisksResponse({ search: '' }),
            this.searchInput.clear(),
        ]);
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

    async openExportDialog(): Promise<void> {
        await this.exportButton.click();
        await expect(this.exportDialog).toBeVisible();
    }

    async chooseExportFormat(format: 'xlsx' | 'csv'): Promise<void> {
        const option = this.page.getByTestId(`export-format-option-${format}`);
        const visible = await option.isVisible().catch(() => false);
        if (!visible) {
            await this.exportFormatTrigger.click();
        }
        await option.click();
    }

    async setExportDate(date: string): Promise<void> {
        await this.exportDateInput.fill(date);
    }

    async submitExport(format: 'xlsx' | 'csv'): Promise<void> {
        await Promise.all([
            this.page.waitForResponse((response) => {
                if (response.request().method() !== 'GET') return false;
                if (!response.url().includes('/api/v1/reports/risks/export')) return false;
                try {
                    const url = new URL(response.url());
                    return (url.searchParams.get('format') || '').toLowerCase() === format;
                } catch {
                    return false;
                }
            }, { timeout: 20000 }),
            this.page.getByTestId('export-submit-button').click(),
        ]);
    }

    async setStatusFilterArchived(): Promise<void> {
        await this.statusSelectTrigger.click();
        await Promise.all([
            this.waitForRisksResponse({ status: 'archived' }),
            this.page.getByTestId('risks-status-filter-option-archived').click(),
        ]);
        await waitForDataLoad(this.page);
    }

    async clickUnarchiveForRow(text: string): Promise<void> {
        const row = this.rowByText(text);
        await row.locator('[data-testid^="risk-unarchive-"]').first().click();
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
