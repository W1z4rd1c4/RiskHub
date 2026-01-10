/**
 * Dashboard Page Object Model
 * Handles main dashboard and navigation interactions
 */
import { Page, Locator, expect } from '@playwright/test';
import { waitForDataLoad } from '../helpers/wait';

export class DashboardPage {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    // Sidebar navigation locators
    get sidebar(): Locator {
        return this.page.locator('aside');
    }

    get risksNavLink(): Locator {
        return this.sidebar.locator('a[href="/risks"], a:has-text("Risks")').first();
    }

    get controlsNavLink(): Locator {
        return this.sidebar.locator('a[href="/controls"], a:has-text("Controls")').first();
    }

    get krisNavLink(): Locator {
        return this.sidebar.locator('a[href="/kris"], a:has-text("Risk Appetite")').first();
    }

    get departmentsNavLink(): Locator {
        return this.sidebar.locator('a[href="/departments"], a:has-text("Departments")').first();
    }

    get approvalsNavLink(): Locator {
        return this.sidebar.locator('a[href="/approvals"], a:has-text("Approvals")').first();
    }

    get activityLogNavLink(): Locator {
        return this.sidebar.locator('a[href="/activity-log"], a:has-text("Activity")').first();
    }

    get adminConsoleLink(): Locator {
        return this.page.locator('a[href="/admin"]');
    }

    get riskHubLink(): Locator {
        return this.sidebar.locator('a[href="/risk-hub"], a:has-text("Risk Hub")').first();
    }

    get settingsLink(): Locator {
        return this.sidebar.locator('a[href="/settings"], a:has-text("Settings")').first();
    }

    // Dashboard metric cards
    get metricCards(): Locator {
        return this.page.locator('[class*="card"], [class*="Card"]');
    }

    get riskCountCard(): Locator {
        return this.page.locator('text=/Total Risks|Risk Count/i').first();
    }

    get controlCountCard(): Locator {
        return this.page.locator('text=/Total Controls|Control Count/i').first();
    }

    // Logout button
    get logoutButton(): Locator {
        return this.page.locator('button:has(.lucide-log-out)');
    }

    // Actions
    async navigate(): Promise<void> {
        await this.page.goto('/dashboard');
        await waitForDataLoad(this.page);
    }

    async navigateToRisks(): Promise<void> {
        await this.risksNavLink.click();
        await this.page.waitForURL(/.*risks/);
        await waitForDataLoad(this.page);
    }

    async navigateToControls(): Promise<void> {
        await this.controlsNavLink.click();
        await this.page.waitForURL(/.*controls/);
        await waitForDataLoad(this.page);
    }

    async navigateToKRIs(): Promise<void> {
        await this.krisNavLink.click();
        await this.page.waitForURL(/.*kris/);
        await waitForDataLoad(this.page);
    }

    async navigateToDepartments(): Promise<void> {
        await this.departmentsNavLink.click();
        await this.page.waitForURL(/.*departments/);
        await waitForDataLoad(this.page);
    }

    async navigateToApprovals(): Promise<void> {
        await this.approvalsNavLink.click();
        await this.page.waitForURL(/.*approvals/);
        await waitForDataLoad(this.page);
    }

    async navigateToAdmin(): Promise<void> {
        await this.adminConsoleLink.click();
        await this.page.waitForURL(/.*admin/);
        await waitForDataLoad(this.page);
    }

    async navigateToRiskHub(): Promise<void> {
        await this.riskHubLink.click();
        await this.page.waitForURL(/.*risk-hub/);
        await waitForDataLoad(this.page);
    }

    async logout(): Promise<void> {
        await this.logoutButton.click();
        await this.page.waitForURL(/.*login/);
    }

    // Assertions
    async expectSidebarVisible(): Promise<void> {
        await expect(this.sidebar).toBeVisible();
    }

    async expectAdminLinkVisible(): Promise<void> {
        await expect(this.adminConsoleLink).toBeVisible();
    }

    async expectAdminLinkHidden(): Promise<void> {
        await expect(this.adminConsoleLink).not.toBeVisible();
    }

    async expectRiskHubLinkVisible(): Promise<void> {
        await expect(this.riskHubLink).toBeVisible();
    }

    async expectRiskHubLinkHidden(): Promise<void> {
        await expect(this.riskHubLink).not.toBeVisible();
    }

    async expectBusinessDataLinksVisible(): Promise<void> {
        await expect(this.risksNavLink).toBeVisible();
        await expect(this.controlsNavLink).toBeVisible();
        await expect(this.krisNavLink).toBeVisible();
    }

    async expectBusinessDataLinksHidden(): Promise<void> {
        await expect(this.risksNavLink).not.toBeVisible();
        await expect(this.controlsNavLink).not.toBeVisible();
        await expect(this.krisNavLink).not.toBeVisible();
    }
}
