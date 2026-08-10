import { expect, type Locator, type Page, type Response } from '@playwright/test';

import { waitForDataLoad } from '../helpers/wait';
import { matchesCollectionResponse } from './collectionResponse';

export type IssueRegisterView =
    | 'all'
    | 'category'
    | 'department'
    | 'owner'
    | 'process'
    | 'risk_type'
    | 'severity'
    | 'status'
    | 'type'
    | 'vendor';

export class IssuesPage {
    constructor(readonly page: Page) {}

    get registerShell(): Locator {
        return this.page.getByTestId('issues-register-shell');
    }

    get pageTitle(): Locator {
        return this.page.locator('h1');
    }

    get table(): Locator {
        return this.page.locator('table').first();
    }

    get tableRows(): Locator {
        return this.table.locator('tbody tr');
    }

    get searchInput(): Locator {
        return this.page.getByTestId('issues-search-input');
    }

    get createButton(): Locator {
        return this.page.getByTestId('issues-create-button');
    }

    get exportButton(): Locator {
        return this.page.getByTestId('issues-export-button');
    }

    get exportDialog(): Locator {
        return this.page.getByTestId('issues-export-dialog');
    }

    get currentViewExportPurpose(): Locator {
        return this.page.getByTestId('export-purpose-current-view');
    }

    get pointInTimeExportPurpose(): Locator {
        return this.page.getByTestId('export-purpose-point-in-time');
    }

    get exportDateInput(): Locator {
        return this.page.getByTestId('export-date-input');
    }

    viewButton(view: IssueRegisterView): Locator {
        return this.page.getByTestId(`issues-view-${view}`);
    }

    rowByText(text: string): Locator {
        return this.tableRows.filter({ hasText: text }).first();
    }

    async navigate(query = ''): Promise<void> {
        await this.page.goto(`/issues${query}`);
        await this.waitForListReady();
    }

    async waitForListReady(timeout = 15_000): Promise<void> {
        await expect(this.registerShell).toBeVisible({ timeout });
        await expect(this.page.getByTestId('sortable-table-skeleton')).toHaveCount(0, { timeout });
        await waitForDataLoad(this.page, timeout);
    }

    async waitForIssuesResponse(expected: { search?: string } = {}): Promise<Response> {
        return this.page.waitForResponse(
            (response) => matchesCollectionResponse(response, '/api/v1/issues', expected),
            { timeout: 15_000 },
        );
    }

    async search(query: string): Promise<void> {
        await Promise.all([
            this.waitForIssuesResponse({ search: query }),
            this.searchInput.fill(query),
        ]);
        await this.waitForListReady();
    }

    async selectView(view: IssueRegisterView): Promise<void> {
        await this.viewButton(view).click();
        await this.waitForListReady();
    }

    async selectStatus(status: 'open' | 'triaged' | 'in_progress' | 'ready_for_validation' | 'closed'): Promise<void> {
        await this.page.getByTestId('issues-status-filter-trigger').click();
        await this.page.getByTestId(`issues-status-filter-option-${status}`).click();
        await this.waitForListReady();
    }

    async selectSeverity(severity: 'low' | 'medium' | 'high' | 'critical' | 'high_critical'): Promise<void> {
        await this.page.getByTestId('issues-severity-filter-trigger').click();
        await this.page.getByTestId(`issues-severity-filter-option-${severity}`).click();
        await this.waitForListReady();
    }

    async openExportDialog(): Promise<void> {
        await this.exportButton.click();
        await expect(this.exportDialog).toBeVisible();
    }

    async chooseCurrentViewExport(): Promise<void> {
        await this.currentViewExportPurpose.check();
        await expect(this.exportDateInput).not.toBeVisible();
    }

    async choosePointInTimeExport(date?: string): Promise<void> {
        await this.pointInTimeExportPurpose.check();
        await expect(this.exportDateInput).toBeVisible();
        if (date) await this.exportDateInput.fill(date);
    }

    async submitCurrentViewExport(): Promise<Response> {
        const responsePromise = this.page.waitForResponse((response) => (
            response.request().method() === 'GET'
            && new URL(response.url()).pathname === '/api/v1/issues/export'
        ));
        await this.page.getByTestId('export-submit-button').click();
        return responsePromise;
    }

    async submitPointInTimeExport(): Promise<Response> {
        const responsePromise = this.page.waitForResponse((response) => (
            response.request().method() === 'GET'
            && new URL(response.url()).pathname === '/api/v1/reports/issues/export'
        ));
        await this.page.getByTestId('export-submit-button').click();
        return responsePromise;
    }
}
