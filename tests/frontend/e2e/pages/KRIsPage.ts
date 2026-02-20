/**
 * KRIs Page Object Model
 * Handles Key Risk Indicator list and interaction operations
 */
import { expect, Locator, Page } from '@playwright/test';
import { waitForDataLoad } from '../helpers/wait';

export class KRIsPage {
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
        return this.page.getByTestId('kris-search-input');
    }

    get createButton(): Locator {
        return this.page.getByTestId('kris-create-button');
    }

    get exportButton(): Locator {
        return this.page.getByTestId('kris-export-button');
    }

    get exportDialog(): Locator {
        return this.page.getByTestId('kris-export-dialog');
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

    // Grid/Card view if applicable
    get gridView(): Locator {
        return this.page.locator('.grid, [role="grid"]');
    }

    get cards(): Locator {
        return this.page.locator('[class*="card"], [class*="Card"]');
    }

    private async waitForKrisResponse(expected: { search?: string } = {}): Promise<void> {
        await this.page.waitForResponse((response) => {
            if (response.request().method() !== 'GET') return false;
            if (!response.url().includes('/api/v1/kris')) return false;
            if (expected.search === undefined) return true;

            try {
                const url = new URL(response.url());
                const actualSearch = (url.searchParams.get('search') || '').trim().toLowerCase();
                return actualSearch.includes(expected.search.trim().toLowerCase());
            } catch {
                return false;
            }
        }, { timeout: 15000 });
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
        const currentValue = await this.searchInput.inputValue();
        if (currentValue === query) {
            await this.waitForListReady();
            return;
        }
        await Promise.all([
            this.waitForKrisResponse({ search: query }).catch(() => undefined),
            this.searchInput.fill(query),
        ]);
        await this.waitForListReady();
    }

    async clearSearch(): Promise<void> {
        const currentValue = await this.searchInput.inputValue();
        if (currentValue.length === 0) {
            await this.waitForListReady();
            return;
        }
        await Promise.all([
            this.waitForKrisResponse({ search: '' }).catch(() => undefined),
            this.searchInput.clear(),
        ]);
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
                if (!response.url().includes('/api/v1/reports/kris/export')) return false;
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
        await this.page.getByTestId('kris-status-filter-archived').click();
        await this.waitForListReady();
    }

    async clickUnarchiveForRow(text: string): Promise<void> {
        const row = this.rowByText(text);
        const rowVisible = await row.isVisible().catch(() => false);
        if (rowVisible) {
            await row.locator('[data-testid^="kri-unarchive-"]').first().click();
        } else {
            await this.cards
                .filter({ hasText: text })
                .first()
                .locator('[data-testid^="kri-unarchive-"]')
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
