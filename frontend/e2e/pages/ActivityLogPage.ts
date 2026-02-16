/**
 * Activity Log Page Object Model
 * Handles Activity Log viewing, filtering, and export operations
 */
import { Page, Locator, expect } from '@playwright/test';
import { waitForDataLoad } from '../helpers/wait';

export class ActivityLogPage {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    // ─────────────────────────────────────────────────────────────
    // Locators
    // ─────────────────────────────────────────────────────────────

    get pageTitle(): Locator {
        return this.page.locator(
            'h1:has-text("Activity Log"), h1:has-text("Audit Trail"), h1:has-text("Auditní stopa")',
        );
    }

    get entriesList(): Locator {
        return this.page.locator('[data-testid="activity-entries"], .space-y-4');
    }

    get entryCards(): Locator {
        return this.page.locator('.backdrop-blur-md, [class*="bg-white/5"]').filter({ hasText: /CREATE|UPDATE|ARCHIVE|APPROVE|REJECT|CANCEL|LINK|UNLINK/ });
    }

    get loadingSpinner(): Locator {
        return this.page.locator('.animate-spin, [data-loading="true"]');
    }

    get emptyState(): Locator {
        return this.page.locator('text=/no (activity|entries)/i, text=/empty/i');
    }

    // Filter controls
    get searchInput(): Locator {
        return this.page.locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="Hledat"]');
    }

    get entityTypeFilter(): Locator {
        return this.page.locator('[data-testid="entity-type-filter"], button:has-text("Entity")');
    }

    get actionFilter(): Locator {
        return this.page.locator('[data-testid="action-filter"], button:has-text("Action")');
    }

    get userFilter(): Locator {
        return this.page.locator('[data-testid="user-filter"], button:has-text("User")');
    }

    get dateRangeFilter(): Locator {
        return this.page.locator('[data-testid="date-range-filter"], input[type="date"]').first();
    }

    // View mode tabs
    get chronologicalTab(): Locator {
        return this.page.locator(
            'button:has-text("Chronological"), [role="tab"]:has-text("Chronological"), ' +
            'button:has-text("Chronologicky"), [role="tab"]:has-text("Chronologicky")',
        );
    }

    get byPersonTab(): Locator {
        return this.page.locator(
            'button:has-text("By Person"), [role="tab"]:has-text("By Person"), ' +
            'button:has-text("Podle osoby"), [role="tab"]:has-text("Podle osoby")',
        );
    }

    get byDepartmentTab(): Locator {
        return this.page.locator(
            'button:has-text("By Department"), [role="tab"]:has-text("By Department"), ' +
            'button:has-text("Podle oddělení"), [role="tab"]:has-text("Podle oddělení")',
        );
    }

    get byRiskTab(): Locator {
        return this.page.locator(
            'button:has-text("By Risk"), [role="tab"]:has-text("By Risk"), ' +
            'button:has-text("Podle rizika"), [role="tab"]:has-text("Podle rizika")',
        );
    }

    // Export buttons
    get exportPDFButton(): Locator {
        return this.page.locator('button:has-text("Export PDF"), button:has(.lucide-file-text)');
    }

    get exportExcelButton(): Locator {
        return this.page.locator('button:has-text("Export Excel"), button:has-text("Excel"), button:has(.lucide-file-spreadsheet)');
    }

    // Pagination
    get paginationPrevious(): Locator {
        return this.page.locator('button:has(.lucide-chevron-left), button:has-text("Previous")');
    }

    get paginationNext(): Locator {
        return this.page.locator('button:has(.lucide-chevron-right), button:has-text("Next")');
    }

    get paginationInfo(): Locator {
        return this.page.locator('text=/\\d+ of \\d+/');
    }

    // ─────────────────────────────────────────────────────────────
    // Navigation
    // ─────────────────────────────────────────────────────────────

    async navigate(): Promise<void> {
        await this.page.goto('/activity-log');
        await waitForDataLoad(this.page);
    }

    async navigateViaSettings(): Promise<void> {
        await this.page.goto('/settings');
        await waitForDataLoad(this.page);
        // Click Activity Log tab
        await this.page.click(
            'button:has-text("Activity Log"), [role="tab"]:has-text("Activity"), ' +
            'button:has-text("Auditní stopa"), [role="tab"]:has-text("Auditní")',
        );
        await waitForDataLoad(this.page);
    }

    // ─────────────────────────────────────────────────────────────
    // Filtering
    // ─────────────────────────────────────────────────────────────

    async filterByEntityType(type: 'RISK' | 'CONTROL' | 'KRI' | 'KRI_VALUE' | 'APPROVAL'): Promise<void> {
        await this.entityTypeFilter.click();
        await this.page.click(`[role="option"]:has-text("${type}"), button:has-text("${type}")`);
        await waitForDataLoad(this.page);
    }

    async filterByAction(action: 'CREATE' | 'UPDATE' | 'ARCHIVE' | 'APPROVE' | 'REJECT' | 'CANCEL' | 'LINK' | 'UNLINK'): Promise<void> {
        await this.actionFilter.click();
        await this.page.click(`[role="option"]:has-text("${action}"), button:has-text("${action}")`);
        await waitForDataLoad(this.page);
    }

    async filterByUser(userName: string): Promise<void> {
        await this.userFilter.click();
        await this.page.click(`[role="option"]:has-text("${userName}"), button:has-text("${userName}")`);
        await waitForDataLoad(this.page);
    }

    async searchEntries(query: string): Promise<void> {
        await this.searchInput.fill(query);
        await this.page.waitForTimeout(500); // Debounce
        await waitForDataLoad(this.page);
    }

    async clearSearch(): Promise<void> {
        await this.searchInput.clear();
        await this.page.waitForTimeout(500);
        await waitForDataLoad(this.page);
    }

    // ─────────────────────────────────────────────────────────────
    // View Modes
    // ─────────────────────────────────────────────────────────────

    async selectChronological(): Promise<void> {
        await this.chronologicalTab.click();
        await waitForDataLoad(this.page);
    }

    async selectByPerson(): Promise<void> {
        await this.byPersonTab.click();
        await waitForDataLoad(this.page);
    }

    async selectByDepartment(): Promise<void> {
        await this.byDepartmentTab.click();
        await waitForDataLoad(this.page);
    }

    async selectByRisk(): Promise<void> {
        await this.byRiskTab.click();
        await waitForDataLoad(this.page);
    }

    // ─────────────────────────────────────────────────────────────
    // Entry Inspection
    // ─────────────────────────────────────────────────────────────

    async getEntryCount(): Promise<number> {
        await waitForDataLoad(this.page);
        return await this.entryCards.count();
    }

    async getEntryText(index: number): Promise<string> {
        return await this.entryCards.nth(index).textContent() ?? '';
    }

    async getEntryEntityType(index: number): Promise<string> {
        const text = await this.getEntryText(index);
        const entityTypes = ['RISK', 'CONTROL', 'KRI_VALUE', 'KRI', 'APPROVAL'];
        for (const type of entityTypes) {
            if (text.includes(type)) return type;
        }
        return 'UNKNOWN';
    }

    async getEntryAction(index: number): Promise<string> {
        const text = await this.getEntryText(index);
        const actions = ['CREATE', 'UPDATE', 'ARCHIVE', 'APPROVE', 'REJECT', 'CANCEL', 'LINK', 'UNLINK'];
        for (const action of actions) {
            if (text.includes(action)) return action;
        }
        return 'UNKNOWN';
    }

    /**
     * Find an entry by matching entity type and action
     */
    async findEntry(entityType: string, action: string, resourceName?: string): Promise<number> {
        const count = await this.getEntryCount();
        for (let i = 0; i < count; i++) {
            const text = await this.getEntryText(i);
            const matchesType = text.includes(entityType);
            const matchesAction = text.includes(action);
            const matchesResource = resourceName ? text.includes(resourceName) : true;
            if (matchesType && matchesAction && matchesResource) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Check if entry has changes/diff displayed
     */
    async entryHasChanges(index: number): Promise<boolean> {
        const entry = this.entryCards.nth(index);
        // Look for diff indicators (arrows, old→new, etc.)
        const diffIndicator = entry.locator('[class*="text-red"], [class*="text-green"], text=/→|old|new/i');
        return await diffIndicator.count() > 0;
    }

    /**
     * Click to expand entry details / changes view
     */
    async expandEntry(index: number): Promise<void> {
        const entry = this.entryCards.nth(index);
        // Try clicking expand button or the entry itself
        const expandButton = entry.locator('button:has(.lucide-chevron-down), button:has-text("Show")');
        if (await expandButton.count() > 0) {
            await expandButton.click();
        } else {
            await entry.click();
        }
        await this.page.waitForTimeout(300); // Animation
    }

    /**
     * Get the changes diff content from an expanded entry
     */
    async getEntryChanges(index: number): Promise<{ field: string; old: string; new: string }[]> {
        const entry = this.entryCards.nth(index);
        const changes: { field: string; old: string; new: string }[] = [];

        // Look for change rows with old → new pattern
        const changeRows = entry.locator('[class*="flex"], div:has([class*="text-red"])');
        const count = await changeRows.count();

        for (let i = 0; i < count; i++) {
            const rowText = await changeRows.nth(i).textContent() ?? '';
            // Try to parse "field: old → new" pattern
            const match = rowText.match(/(\w+):\s*(.+?)\s*→\s*(.+)/);
            if (match) {
                changes.push({ field: match[1], old: match[2].trim(), new: match[3].trim() });
            }
        }

        return changes;
    }

    // ─────────────────────────────────────────────────────────────
    // Export
    // ─────────────────────────────────────────────────────────────

    async exportToPDF(): Promise<void> {
        await this.exportPDFButton.click();
        // Wait for download to start
        await this.page.waitForTimeout(1000);
    }

    async exportToExcel(): Promise<void> {
        await this.exportExcelButton.click();
        await this.page.waitForTimeout(1000);
    }

    // ─────────────────────────────────────────────────────────────
    // Pagination
    // ─────────────────────────────────────────────────────────────

    async goToNextPage(): Promise<void> {
        await this.paginationNext.click();
        await waitForDataLoad(this.page);
    }

    async goToPreviousPage(): Promise<void> {
        await this.paginationPrevious.click();
        await waitForDataLoad(this.page);
    }

    // ─────────────────────────────────────────────────────────────
    // Assertions
    // ─────────────────────────────────────────────────────────────

    async expectPageVisible(): Promise<void> {
        await expect(
            this.page.locator(
                'h1:has-text("Activity Log"), h1:has-text("Audit Trail"), h1:has-text("Auditní stopa")',
            ).first(),
        ).toBeVisible();
    }

    async expectEntriesLoaded(minEntries = 1): Promise<void> {
        await waitForDataLoad(this.page);
        const count = await this.getEntryCount();
        expect(count).toBeGreaterThanOrEqual(minEntries);
    }

    async expectEmptyState(): Promise<void> {
        const count = await this.getEntryCount();
        expect(count).toBe(0);
    }

    async expectEntryExists(entityType: string, action: string, resourceName?: string): Promise<void> {
        const index = await this.findEntry(entityType, action, resourceName);
        expect(index).toBeGreaterThanOrEqual(0);
    }

    async expectEntryNotExists(entityType: string, action: string, resourceName?: string): Promise<void> {
        const index = await this.findEntry(entityType, action, resourceName);
        expect(index).toBe(-1);
    }
}
