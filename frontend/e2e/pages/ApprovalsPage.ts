/**
 * Approvals Page Object Model
 * Handles Approval workflow list and interaction operations
 */
import { Page, Locator, expect } from '@playwright/test';
import { waitForDataLoad } from '../helpers/wait';

export class ApprovalsPage {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    // ─────────────────────────────────────────────────────────────
    // Locators
    // ─────────────────────────────────────────────────────────────

    get pageTitle(): Locator {
        return this.page.locator('h1:has-text("Workflow")');
    }

    get pendingQueueTab(): Locator {
        return this.page.locator('button:has-text("Pending Queue")');
    }

    get myRequestsTab(): Locator {
        return this.page.locator('button:has-text("My Requests")');
    }

    get historyTab(): Locator {
        return this.page.locator('button:has-text("History")');
    }

    get loadingSpinner(): Locator {
        return this.page.locator('.animate-spin');
    }

    get emptyState(): Locator {
        return this.page.locator('text="All Caught Up"');
    }

    get approvalCards(): Locator {
        // Target cards within the approvals list (div.space-y-4 container)
        return this.page.locator('.space-y-4 > .glass-card, .space-y-4 > div.glass-card');
    }

    get resolutionDialog(): Locator {
        return this.page.locator('.fixed.inset-0 >> .bg-slate-900');
    }

    get resolutionNotesInput(): Locator {
        return this.page.locator('textarea[placeholder="Enter resolution notes..."]');
    }

    get dialogApproveButton(): Locator {
        return this.resolutionDialog.locator('button:has-text("Approve")');
    }

    get dialogRejectButton(): Locator {
        return this.resolutionDialog.locator('button:has-text("Reject")');
    }

    get dialogCancelButton(): Locator {
        return this.resolutionDialog.locator('button:has-text("Cancel")');
    }

    // ─────────────────────────────────────────────────────────────
    // Actions
    // ─────────────────────────────────────────────────────────────

    async navigate(): Promise<void> {
        await this.page.goto('/approvals');
        await waitForDataLoad(this.page);
    }

    async selectPendingQueue(): Promise<void> {
        await this.pendingQueueTab.click();
        await waitForDataLoad(this.page);
    }

    async selectMyRequests(): Promise<void> {
        await this.myRequestsTab.click();
        await waitForDataLoad(this.page);
    }

    async selectHistory(): Promise<void> {
        await this.historyTab.click();
        await waitForDataLoad(this.page);
    }

    async getApprovalCount(): Promise<number> {
        await waitForDataLoad(this.page);
        return await this.approvalCards.count();
    }

    /**
     * Get the nth approval card (0-indexed)
     */
    getCard(index: number): Locator {
        return this.approvalCards.nth(index);
    }

    /**
     * Get the resource name from an approval card
     */
    async getResourceName(index: number): Promise<string> {
        const card = this.getCard(index);
        return await card.locator('h3').textContent() ?? '';
    }

    /**
     * Get the status badge text from an approval card
     */
    async getStatus(index: number): Promise<string> {
        const card = this.getCard(index);
        // The status badge has specific styling: rounded-full with text-[10px] font-black uppercase tracking-widest
        const statusBadge = card.locator('span.rounded-full.uppercase');
        return (await statusBadge.textContent() ?? '').toLowerCase().trim();
    }

    /**
     * Get the action type (delete/edit) from an approval card
     */
    async getActionType(index: number): Promise<string> {
        const card = this.getCard(index);
        const actionBadge = card.locator('.rounded:has(.lucide-trash-2), .rounded:has(.lucide-edit)');
        return (await actionBadge.textContent() ?? '').toLowerCase().trim();
    }

    /**
     * Check if the approve button is visible on the nth card
     */
    async isApproveButtonVisible(index: number): Promise<boolean> {
        const card = this.getCard(index);
        const approveBtn = card.locator('button[title="Approve"]');
        return await approveBtn.isVisible();
    }

    /**
     * Check if the reject button is visible on the nth card
     */
    async isRejectButtonVisible(index: number): Promise<boolean> {
        const card = this.getCard(index);
        const rejectBtn = card.locator('button[title="Reject"]');
        return await rejectBtn.isVisible();
    }

    /**
     * Check if the cancel button is visible on the nth card
     */
    async isCancelButtonVisible(index: number): Promise<boolean> {
        const card = this.getCard(index);
        const cancelBtn = card.locator('button[title="Cancel Request"]');
        return await cancelBtn.isVisible();
    }

    /**
     * Click the approve button on the nth card
     */
    async clickApprove(index: number): Promise<void> {
        const card = this.getCard(index);
        await card.locator('button[title="Approve"]').click();
        await expect(this.resolutionDialog).toBeVisible();
    }

    /**
     * Click the reject button on the nth card
     */
    async clickReject(index: number): Promise<void> {
        const card = this.getCard(index);
        await card.locator('button[title="Reject"]').click();
        await expect(this.resolutionDialog).toBeVisible();
    }

    /**
     * Click the cancel button on the nth card
     */
    async clickCancel(index: number): Promise<void> {
        const card = this.getCard(index);
        this.page.once('dialog', dialog => dialog.accept());
        await card.locator('button[title="Cancel Request"]').click();
        await waitForDataLoad(this.page);
    }

    /**
     * Submit resolution (approve or reject) with notes
     */
    async submitResolution(notes: string, action: 'approve' | 'reject'): Promise<void> {
        await this.resolutionNotesInput.fill(notes);
        if (action === 'approve') {
            await this.dialogApproveButton.click();
        } else {
            await this.dialogRejectButton.click();
        }
        await waitForDataLoad(this.page);
    }

    /**
     * Close the resolution dialog
     */
    async closeResolutionDialog(): Promise<void> {
        await this.dialogCancelButton.click();
    }

    /**
     * Expand the changes preview for an edit request
     */
    async expandChanges(index: number): Promise<void> {
        const card = this.getCard(index);
        const expandBtn = card.locator('button:has(.lucide-chevron-down)');
        if (await expandBtn.isVisible()) {
            await expandBtn.click();
        }
    }

    /**
     * Find a card by resource name
     */
    async findCardByResourceName(resourceName: string): Promise<number> {
        const count = await this.getApprovalCount();
        for (let i = 0; i < count; i++) {
            const name = await this.getResourceName(i);
            if (name.includes(resourceName)) {
                return i;
            }
        }
        return -1;
    }

    // ─────────────────────────────────────────────────────────────
    // Assertions
    // ─────────────────────────────────────────────────────────────

    async expectPageVisible(): Promise<void> {
        await expect(this.pageTitle).toBeVisible();
    }

    async expectEmptyState(): Promise<void> {
        await expect(this.emptyState).toBeVisible();
    }

    async expectCardsLoaded(minCards = 1): Promise<void> {
        await waitForDataLoad(this.page);
        await expect(this.approvalCards.first()).toBeVisible();
        const count = await this.approvalCards.count();
        expect(count).toBeGreaterThanOrEqual(minCards);
    }

    async expectStatus(index: number, status: string): Promise<void> {
        const actualStatus = await this.getStatus(index);
        expect(actualStatus).toBe(status.toLowerCase());
    }
}
