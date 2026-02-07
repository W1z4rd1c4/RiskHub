import { expect, Locator, Page } from '@playwright/test';
import { waitForDataLoad } from '../helpers/wait';

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
        return this.page.locator('input[placeholder*="Search"], input[type="search"]').first();
    }

    get includeArchivedCheckbox(): Locator {
        return this.page.locator('label:has(input[type="checkbox"]) input[type="checkbox"]').first();
    }

    get statusSelectTrigger(): Locator {
        return this.page.locator('[role="combobox"]').first();
    }

    async navigate(): Promise<void> {
        await this.page.goto('/vendors');
        await waitForDataLoad(this.page);
    }

    async search(query: string): Promise<void> {
        await this.searchInput.fill(query);
        await this.page.waitForTimeout(400);
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

    async setIncludeArchived(enabled: boolean): Promise<void> {
        const currentState = await this.includeArchivedCheckbox.isChecked();
        if (currentState !== enabled) {
            await this.includeArchivedCheckbox.click();
            await waitForDataLoad(this.page);
        }
    }

    async setStatusFilterInactive(): Promise<void> {
        await this.statusSelectTrigger.click();
        await this.page.locator('[role="option"]').filter({ hasText: /inactive|neaktivn/i }).first().click();
        await waitForDataLoad(this.page);
    }

    async clickUnarchiveForRow(text: string): Promise<void> {
        await this.rowByText(text)
            .locator('button:has-text("Unarchive"), button:has-text("Obnov")')
            .first()
            .click();
        await waitForDataLoad(this.page);
    }

    async expectTableVisible(): Promise<void> {
        await expect(this.table).toBeVisible();
    }
}
