/**
 * Login Page Object Model
 * Handles demo account picker interactions
 */
import { Page, Locator } from '@playwright/test';

export class LoginPage {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    // Locators
    get demoHeader(): Locator {
        return this.page.locator('text=RiskHub Demo');
    }

    get privilegedSection(): Locator {
        return this.page.locator('text=Privileged').first();
    }

    get departmentHeadsSection(): Locator {
        return this.page.locator('text=Department Heads');
    }

    get employeesSection(): Locator {
        return this.page.locator('text=Employees');
    }

    getDemoAccountButton(accountName: string): Locator {
        return this.page.locator(`button:has-text("${accountName}")`);
    }

    // Actions
    async navigate(): Promise<void> {
        await this.page.goto('/login');
    }

    async selectDemoAccount(accountName: string): Promise<void> {
        await this.getDemoAccountButton(accountName).click();
    }

    async waitForDemoAccountsLoaded(): Promise<void> {
        await this.privilegedSection.waitFor({ state: 'visible', timeout: 10000 });
    }

    // Assertions
    async isDisplayed(): Promise<boolean> {
        try {
            await this.demoHeader.waitFor({ state: 'visible', timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }
}
