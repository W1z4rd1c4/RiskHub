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
        return this.page.locator('button:has-text("Pending Queue"), button:has-text("Fronta čekajících")');
    }

    get myRequestsTab(): Locator {
        return this.page.locator('button:has-text("My Requests"), button:has-text("Moje žádosti")');
    }

    get historyTab(): Locator {
        return this.page.locator('button:has-text("History"), button:has-text("Historie")');
    }

    get loadingSpinner(): Locator {
        return this.page.locator('.animate-spin');
    }

    get emptyState(): Locator {
        return this.page.locator('.border-dashed').first();
    }

    get approvalCards(): Locator {
        // Cards are wrapped by motion divs; do not assume direct child relationship.
        return this.page.locator('.space-y-4 .glass-card');
    }

    get resolutionDialog(): Locator {
        return this.page.locator('.fixed.inset-0.z-50 .glass');
    }

    get resolutionNotesInput(): Locator {
        return this.page.locator('.fixed.inset-0.z-50 textarea').first();
    }

    get dialogApproveButton(): Locator {
        return this.resolutionDialog.locator('button:has-text("Approve"), button:has-text("Schválit")');
    }

    get dialogRejectButton(): Locator {
        return this.resolutionDialog.locator('button:has-text("Reject"), button:has-text("Zamítnout")');
    }

    get dialogCancelButton(): Locator {
        return this.resolutionDialog.locator('button:has-text("Cancel"), button:has-text("Zrušit")');
    }

    // ─────────────────────────────────────────────────────────────
    // Actions
    // ─────────────────────────────────────────────────────────────

    async navigate(): Promise<void> {
        await this.page.goto('/approvals');
        await this.waitForApprovalsReady();
    }

    async selectPendingQueue(): Promise<void> {
        await Promise.all([
            this.waitForApprovalsResponse({ status: 'pending', myRequests: false }),
            this.pendingQueueTab.click(),
        ]);
        await this.waitForActiveTab(this.pendingQueueTab);
        await this.waitForApprovalsReady();
    }

    async selectMyRequests(): Promise<void> {
        await Promise.all([
            this.waitForApprovalsResponse({ myRequests: true }),
            this.myRequestsTab.click(),
        ]);
        await this.waitForActiveTab(this.myRequestsTab);
        await this.waitForApprovalsReady();
    }

    async selectHistory(): Promise<void> {
        await Promise.all([
            this.waitForApprovalsResponse({ myRequests: false }),
            this.historyTab.click(),
        ]);
        await this.waitForActiveTab(this.historyTab);
        await this.waitForApprovalsReady();
    }

    private async waitForActiveTab(tab: Locator, timeout = 15000): Promise<void> {
        await expect(tab).toHaveClass(/bg-accent/, { timeout });
    }

    private async waitForApprovalsResponse(expected: { status?: string; myRequests?: boolean }, timeout = 15000): Promise<void> {
        await this.page.waitForResponse((response) => {
            if (response.request().method() !== 'GET') return false;
            if (!response.url().includes('/api/v1/approvals')) return false;

            try {
                const url = new URL(response.url());
                const status = url.searchParams.get('status');
                const myRequests = url.searchParams.get('my_requests') === 'true';

                if (expected.status !== undefined && status !== expected.status) return false;
                if (expected.status === undefined && status !== null) return false;
                return myRequests === Boolean(expected.myRequests);
            } catch {
                return false;
            }
        }, { timeout });
    }

    async waitForApprovalsReady(timeout = 15000): Promise<void> {
        await waitForDataLoad(this.page, timeout);
        const ready = await Promise.race([
            this.approvalCards.first().waitFor({ state: 'visible', timeout }).then(() => true),
            this.emptyState.waitFor({ state: 'visible', timeout }).then(() => true),
        ]).catch(() => false);
        if (!ready) {
            throw new Error('Approvals list did not reach a ready state (cards or empty state).');
        }
    }

    async getApprovalCount(): Promise<number> {
        await this.waitForApprovalsReady();
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
        const actionBadge = card.locator(
            '.rounded:has(.lucide-trash-2), .rounded:has(.lucide-edit), ' +
            '.rounded:has-text("delete"), .rounded:has-text("edit")'
        ).first();
        const badgeText = (await actionBadge.textContent().catch(() => ''))?.toLowerCase().trim() ?? '';
        if (badgeText.includes('delete') || badgeText.includes('edit')) {
            return badgeText;
        }

        const cardText = (await card.textContent() ?? '').toLowerCase();
        if (cardText.includes('delete')) return 'delete';
        if (cardText.includes('edit')) return 'edit';
        return '';
    }

    /**
     * Check if the approve button is visible on the nth card
     */
    async isApproveButtonVisible(index: number): Promise<boolean> {
        const card = this.getCard(index);
        const approveBtn = card.locator('button[title="Approve"], button[title="Schválit"]');
        return await approveBtn.isVisible();
    }

    /**
     * Check if the reject button is visible on the nth card
     */
    async isRejectButtonVisible(index: number): Promise<boolean> {
        const card = this.getCard(index);
        const rejectBtn = card.locator('button[title="Reject"], button[title="Zamítnout"]');
        return await rejectBtn.isVisible();
    }

    /**
     * Check if the cancel button is visible on the nth card
     */
    async isCancelButtonVisible(index: number): Promise<boolean> {
        const card = this.getCard(index);
        const cancelBtn = card.locator('button[title="Cancel Request"], button[title="Zrušit žádost"]');
        return await cancelBtn.isVisible();
    }

    /**
     * Click the approve button on the nth card
     */
    async clickApprove(index: number): Promise<void> {
        const card = this.getCard(index);
        await card.locator('button[title="Approve"], button[title="Schválit"]').click();
        await expect(this.resolutionDialog).toBeVisible();
    }

    /**
     * Click the reject button on the nth card
     */
    async clickReject(index: number): Promise<void> {
        const card = this.getCard(index);
        await card.locator('button[title="Reject"], button[title="Zamítnout"]').click();
        await expect(this.resolutionDialog).toBeVisible();
    }

    /**
     * Click the cancel button on the nth card
     */
    async clickCancel(index: number): Promise<void> {
        const card = this.getCard(index);
        this.page.once('dialog', dialog => dialog.accept());
        await card.locator('button[title="Cancel Request"], button[title="Zrušit žádost"]').click();
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

    /**
     * Find a card by deterministic reason text.
     */
    async findCardByReason(reason: string): Promise<number> {
        const count = await this.getApprovalCount();
        for (let i = 0; i < count; i++) {
            const cardText = await this.getCard(i).textContent() ?? '';
            if (cardText.includes(reason)) {
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
        await this.waitForApprovalsReady();
        await expect(this.approvalCards.first()).toBeVisible();
        const count = await this.approvalCards.count();
        expect(count).toBeGreaterThanOrEqual(minCards);
    }

    async expectStatus(index: number, status: string): Promise<void> {
        const actualStatus = await this.getStatus(index);
        expect(actualStatus).toBe(status.toLowerCase());
    }
}
