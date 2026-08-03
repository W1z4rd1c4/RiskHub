import { expect, Locator, Page } from '@playwright/test';
import { waitForDataLoad } from '../helpers/wait';
import { matchesCollectionResponse } from './collectionResponse';

export class AssetsPage {
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
        return this.page.getByTestId('assets-search-input');
    }

    get createButton(): Locator {
        return this.page.getByTestId('assets-create-button');
    }

    get statusSelectTrigger(): Locator {
        return this.page.getByTestId('assets-status-filter-trigger');
    }

    private async waitForAssetsResponse(
        expected: { search?: string; lifecycle?: string } = {},
    ): Promise<void> {
        await this.page.waitForResponse(
            (response) => matchesCollectionResponse(response, '/api/v1/assets', expected),
            { timeout: 15000 },
        );
    }

    async navigate(): Promise<void> {
        await this.page.goto('/assets');
        // Settle the app-boot window (session/preferences/list fetches): a
        // late remount would otherwise wipe in-flight search input state.
        await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await waitForDataLoad(this.page);
    }

    async search(query: string): Promise<void> {
        // Refill once if a late remount reset the controlled input; row
        // assertions in the tests auto-retry against the debounced fetch.
        for (let attempt = 1; attempt <= 2; attempt++) {
            await this.searchInput.fill(query);
            try {
                await expect(this.searchInput).toHaveValue(query, { timeout: 3000 });
                break;
            } catch (error) {
                if (attempt === 2) throw error;
            }
        }
        await this.waitForAssetsResponse({ search: query }).catch(() => {
            // The debounced response may have already landed; rely on the
            // retrying row assertions that follow.
        });
        await waitForDataLoad(this.page);
    }

    async setStatusFilterArchived(): Promise<void> {
        await this.statusSelectTrigger.click();
        await Promise.all([
            this.waitForAssetsResponse({ lifecycle: 'archived' }),
            this.page.getByTestId('assets-status-filter-option-archived').click(),
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
            throw new Error(`Asset row not found for deterministic fixture: ${text}`);
        }
        await row.click();
        await this.page.waitForURL(/.*assets\/\d+/);
        await waitForDataLoad(this.page);
    }
}
