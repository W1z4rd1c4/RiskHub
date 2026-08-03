import type { Locator, Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';

import { ApprovalsPage } from '../../../e2e/pages/ApprovalsPage';

describe('ApprovalsPage pending queue selection', () => {
    it('uses the loaded pending queue without waiting for a second response', async () => {
        const pendingQueueTab = {
            evaluate: vi.fn().mockResolvedValue(true),
            click: vi.fn(),
        } as unknown as Locator;
        const page = {
            locator: vi.fn().mockReturnValue(pendingQueueTab),
            waitForResponse: vi.fn().mockRejectedValue(new Error('unexpected second approvals request')),
        } as unknown as Page;
        const approvals = new ApprovalsPage(page);
        vi.spyOn(approvals, 'waitForApprovalsReady').mockResolvedValue();

        await approvals.selectPendingQueue();

        expect(page.waitForResponse).not.toHaveBeenCalled();
        expect(pendingQueueTab.click).not.toHaveBeenCalled();
        expect(approvals.waitForApprovalsReady).toHaveBeenCalledOnce();
    });
});

describe('ApprovalsPage my requests selection', () => {
    it('preserves the loaded My Requests view without waiting for a second response', async () => {
        const myRequestsTab = {
            evaluate: vi.fn().mockResolvedValue(true),
            click: vi.fn(),
        } as unknown as Locator;
        const page = {
            locator: vi.fn().mockReturnValue(myRequestsTab),
            waitForResponse: vi.fn().mockRejectedValue(new Error('unexpected second approvals request')),
        } as unknown as Page;
        const approvals = new ApprovalsPage(page);
        vi.spyOn(approvals, 'waitForApprovalsReady').mockResolvedValue();

        await approvals.selectMyRequests();

        expect(page.waitForResponse).not.toHaveBeenCalled();
        expect(myRequestsTab.click).not.toHaveBeenCalled();
        expect(approvals.waitForApprovalsReady).toHaveBeenCalledOnce();
    });
});
