import { expect, Locator, Page } from '@playwright/test';
import { waitForDataLoad } from '../helpers/wait';

export class VendorDetailPage {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async navigate(vendorId: number, tab?: 'sla' | 'linked_risks' | 'linked_controls'): Promise<void> {
        const suffix = tab ? `?tab=${tab}` : '';
        await this.page.goto(`/vendors/${vendorId}${suffix}`);
        await waitForDataLoad(this.page);
    }

    get includeArchivedSlaCheckbox(): Locator {
        return this.page
            .locator('section')
            .filter({ hasText: /SLA/i })
            .locator('label:has(input[type="checkbox"]) input[type="checkbox"]')
            .first();
    }

    vendorUnarchiveButton(): Locator {
        return this.page.locator('button:has-text("Unarchive"), button:has-text("Obnov")').first();
    }

    slaCard(metricName: string): Locator {
        return this.page
            .locator('div.rounded-2xl')
            .filter({ has: this.page.locator('p.text-sm.font-bold', { hasText: metricName }) })
            .first();
    }

    async setIncludeArchivedSla(enabled: boolean): Promise<void> {
        const checkbox = this.includeArchivedSlaCheckbox;
        const current = await checkbox.isChecked();
        if (current !== enabled) {
            await checkbox.click();
            await waitForDataLoad(this.page);
        }
    }

    async clickVendorUnarchive(): Promise<void> {
        await this.vendorUnarchiveButton().click();
        await waitForDataLoad(this.page);
    }

    async clickSlaUnarchive(metricName: string): Promise<void> {
        const card = this.slaCard(metricName);
        await card
            .locator('button:has-text("Unarchive"), button:has-text("Obnov")')
            .first()
            .click();
        await waitForDataLoad(this.page);
    }

    async expectLoaded(): Promise<void> {
        await expect(this.page.locator('h1, h2').first()).toBeVisible();
    }
}
