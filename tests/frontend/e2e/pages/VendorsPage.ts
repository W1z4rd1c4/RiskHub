import { expect, Locator, Page } from '@playwright/test';
import { waitForDataLoad } from '../helpers/wait';
import { matchesCollectionResponse } from './collectionResponse';

export class VendorsPage {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    get table(): Locator {
        return this.page.locator('table').first();
    }

    get tableRows(): Locator {
        return this.table.locator('tbody tr');
    }

    get searchInput(): Locator {
        return this.page.getByTestId('vendors-search-input');
    }

    get statusSelectTrigger(): Locator {
        return this.page.getByTestId('vendors-status-filter-trigger');
    }

    get exportButton(): Locator {
        return this.page.getByTestId('vendors-export-button');
    }

    get exportDialog(): Locator {
        return this.page.getByTestId('vendors-export-dialog');
    }

    get exportFormatTrigger(): Locator {
        return this.page.getByTestId('export-format-trigger');
    }

    get exportDateInput(): Locator {
        return this.page.getByTestId('export-date-input');
    }

    private async waitForVendorsResponse(expected: { search?: string; include_archived?: boolean } = {}): Promise<void> {
        await this.page.waitForResponse(
            (response) => matchesCollectionResponse(response, '/api/v1/vendors', expected),
            { timeout: 15000 },
        );
    }

    async navigate(): Promise<void> {
        await this.page.goto('/vendors');
        await waitForDataLoad(this.page);
    }

    async search(query: string): Promise<void> {
        const currentValue = await this.searchInput.inputValue();
        if (currentValue === query) {
            await waitForDataLoad(this.page);
            return;
        }
        await Promise.all([
            this.waitForVendorsResponse({ search: query }),
            this.searchInput.fill(query),
        ]);
        await waitForDataLoad(this.page);
    }

    rowByText(text: string): Locator {
        return this.tableRows.filter({ hasText: text }).first();
    }

    async openRowByText(text: string): Promise<void> {
        const row = this.rowByText(text);
        const visible = await row.isVisible().catch(() => false);
        if (!visible) {
            throw new Error(`Vendor row not found for deterministic fixture: ${text}`);
        }
        await row.click();
        await this.page.waitForURL(/.*vendors\/\d+/);
        await waitForDataLoad(this.page);
    }

    async openExportDialog(): Promise<void> {
        await this.exportButton.click();
        await expect(this.exportDialog).toBeVisible();
    }

    async chooseExportFormat(format: 'csv'): Promise<void> {
        if (format !== 'csv') {
            throw new Error('Only CSV export is supported');
        }
    }

    async setExportDate(date: string): Promise<void> {
        await this.exportDateInput.fill(date);
    }

    async submitExport(format: 'csv' = 'csv'): Promise<void> {
        await Promise.all([
            this.page.waitForResponse((response) => {
                if (response.request().method() !== 'GET') return false;
                if (!response.url().includes('/api/v1/reports/vendors/export')) return false;
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

    async setStatusFilterInactive(): Promise<void> {
        await this.statusSelectTrigger.click();
        await Promise.all([
            this.waitForVendorsResponse({ include_archived: true }),
            this.page.getByTestId('vendors-status-filter-option-inactive').click(),
        ]);
        await waitForDataLoad(this.page);
    }

    async clickUnarchiveForRow(text: string): Promise<void> {
        await this.rowByText(text)
            .locator('[data-testid^="vendor-unarchive-"]')
            .first()
            .click();
        await waitForDataLoad(this.page);
    }

    async expectTableVisible(): Promise<void> {
        await expect(this.table).toBeVisible();
    }
}
