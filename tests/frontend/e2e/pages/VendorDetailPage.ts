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

    /** Deep-link into an ICT Register section anchor (tab=contracts / tab=sub-outsourcing). */
    async navigateToSection(vendorId: number, tab: 'contracts' | 'sub-outsourcing'): Promise<void> {
        await this.page.goto(`/vendors/${vendorId}?tab=${tab}`);
        await waitForDataLoad(this.page);
    }

    /** The Contracts section card (deep-link anchor id vendor-contracts). */
    get contractsSection(): Locator {
        return this.page.locator('#vendor-contracts');
    }

    /** The Sub-outsourcing section card (deep-link anchor id vendor-sub-outsourcing). */
    get subOutsourcingSection(): Locator {
        return this.page.locator('#vendor-sub-outsourcing');
    }

    contractRowByText(text: string): Locator {
        return this.contractsSection.locator('tbody tr').filter({ hasText: text }).first();
    }

    subOutsourcingRowByText(text: string): Locator {
        return this.subOutsourcingSection.locator('tbody tr').filter({ hasText: text }).first();
    }

    vendorUnarchiveButton(): Locator {
        return this.page.locator('button:has-text("Unarchive"), button:has-text("Obnov")').first();
    }

    async clickVendorUnarchive(): Promise<void> {
        await this.vendorUnarchiveButton().click();
        await waitForDataLoad(this.page);
    }

    async expectLoaded(): Promise<void> {
        await expect(this.page.locator('main h1, main h2').first()).toBeVisible();
    }
}
