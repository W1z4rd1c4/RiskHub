import { expect, Locator, Page } from '@playwright/test';
import { waitForDataLoad } from '../helpers/wait';

export class VendorDetailPage {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async navigate(
        vendorId: number,
    ): Promise<void> {
        await this.page.goto(`/vendors/${vendorId}`);
        await waitForDataLoad(this.page);
    }

    vendorUnarchiveButton(): Locator {
        return this.page.locator('button:has-text("Unarchive"), button:has-text("Obnov")').first();
    }

    async clickVendorUnarchive(): Promise<void> {
        await this.vendorUnarchiveButton().click();
        await waitForDataLoad(this.page);
    }

    async expectLoaded(): Promise<void> {
        await expect(this.page.locator('h1, h2').first()).toBeVisible();
    }
}
