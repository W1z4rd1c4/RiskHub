/**
 * Controls Page Object Model
 * Handles Control list and interaction operations
 */
import { expect, Locator, Page, type Download, type Response } from '@playwright/test';
import { waitForDataLoad, waitForTableRows } from '../helpers/wait';
import { matchesCollectionResponse } from './collectionResponse';

export class ControlsPage {
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
        return this.page.getByTestId('controls-search-input');
    }

    get createButton(): Locator {
        return this.page.getByTestId('controls-create-button');
    }

    get statusSelectTrigger(): Locator {
        return this.page.getByTestId('controls-lifecycle-filter-trigger');
    }

    get exportButton(): Locator {
        return this.page.getByTestId('controls-export-button');
    }

    get exportDialog(): Locator {
        return this.page.getByTestId('controls-export-dialog');
    }

    get exportDateInput(): Locator {
        return this.page.getByTestId('export-date-input');
    }

    get currentViewExportPurpose(): Locator {
        return this.page.getByTestId('export-purpose-current-view');
    }

    get pointInTimeExportPurpose(): Locator {
        return this.page.getByTestId('export-purpose-point-in-time');
    }

    get paginationControls(): Locator {
        return this.page.locator('[class*="pagination"], nav[aria-label*="pagination"]');
    }

    private async waitForControlsResponse(expected: { lifecycle?: string; search?: string; status?: string } = {}): Promise<void> {
        await this.page.waitForResponse(
            (response) => matchesCollectionResponse(response, '/api/v1/controls', expected),
            { timeout: 15000 },
        );
    }

    // Actions
    async navigate(): Promise<void> {
        await this.page.goto('/controls');
        await waitForDataLoad(this.page);
    }

    async search(query: string): Promise<void> {
        await expect(this.searchInput).toBeVisible({ timeout: 10000 });
        const currentValue = await this.searchInput.inputValue();
        if (currentValue === query) {
            await waitForDataLoad(this.page);
            return;
        }
        await Promise.all([
            this.waitForControlsResponse({ search: query }),
            this.searchInput.fill(query),
        ]);
        await waitForDataLoad(this.page);
    }

    async clearSearch(): Promise<void> {
        const currentValue = await this.searchInput.inputValue();
        if (currentValue.length === 0) {
            await waitForDataLoad(this.page);
            return;
        }
        await Promise.all([
            this.waitForControlsResponse({ search: '' }),
            this.searchInput.clear(),
        ]);
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
        for (let attempt = 1; attempt <= 3; attempt++) {
            const row = this.rowByText(text);
            try {
                await expect(row).toBeVisible({ timeout: 10000 });
                await row.scrollIntoViewIfNeeded();
                await row.click({ timeout: 8000, force: true });
                await this.page.waitForURL(/.*controls\/\d+/, { timeout: 10000 });
                await waitForDataLoad(this.page);
                return;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const retryable =
                    message.includes('detached from the DOM') ||
                    message.includes('Timeout') ||
                    message.includes('waiting for locator') ||
                    message.includes('not found');
                if (!retryable || attempt === 3) {
                    throw error;
                }
                await waitForDataLoad(this.page);
                await this.search(text);
            }
        }
        throw new Error(`Control row not found for deterministic fixture: ${text}`);
    }

    async clickCreateButton(): Promise<void> {
        await this.createButton.click();
        await waitForDataLoad(this.page);
    }

    async openExportDialog(): Promise<void> {
        await this.exportButton.click();
        await expect(this.exportDialog).toBeVisible();
    }

    async setExportDate(date: string): Promise<void> {
        await this.exportDateInput.fill(date);
    }

    async selectCurrentViewExport(): Promise<void> {
        await this.currentViewExportPurpose.check();
        await expect(this.currentViewExportPurpose).toBeChecked();
        await expect(this.exportDateInput).not.toBeVisible();
    }

    async selectPointInTimeExport(): Promise<void> {
        await this.pointInTimeExportPurpose.check();
        await expect(this.pointInTimeExportPurpose).toBeChecked();
        await expect(this.exportDateInput).toBeVisible();
    }

    async submitCurrentViewExport(): Promise<Response> {
        const [response] = await Promise.all([
            this.page.waitForResponse((response) => (
                response.request().method() === 'GET'
                && new URL(response.url()).pathname === '/api/v1/controls/export'
            ), { timeout: 20000 }),
            this.page.getByTestId('export-submit-button').click(),
        ]);
        return response;
    }

    async submitPointInTimeExport(format: 'csv' = 'csv'): Promise<{ response: Response; download: Download }> {
        const asOfDate = await this.exportDateInput.inputValue();
        const [response, download] = await Promise.all([
            this.page.waitForResponse((response) => {
                if (response.request().method() !== 'GET') return false;
                if (new URL(response.url()).pathname !== '/api/v1/reports/controls/export') return false;
                try {
                    const url = new URL(response.url());
                    return (url.searchParams.get('format') || '').toLowerCase() === format
                        && url.searchParams.get('as_of_date') === asOfDate;
                } catch {
                    return false;
                }
            }, { timeout: 20000 }),
            this.page.waitForEvent('download'),
            this.page.getByTestId('export-submit-button').click(),
        ]);
        return { response, download };
    }

    async setStatusFilterArchived(): Promise<void> {
        await this.statusSelectTrigger.click();
        await Promise.all([
            this.waitForControlsResponse({ lifecycle: 'archived' }),
            this.page.getByTestId('controls-lifecycle-filter-option-archived').click(),
        ]);
        await waitForDataLoad(this.page);
    }

    async clickUnarchiveForRow(text: string): Promise<void> {
        const row = this.rowByText(text);
        await row.locator('[data-testid^="control-unarchive-"]').first().click();
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
