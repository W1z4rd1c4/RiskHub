import type { Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';

import { ApprovalsPage } from '../../../e2e/pages/ApprovalsPage';

const anyRegExp: unknown = expect.any(RegExp);

describe('ApprovalsPage pending queue selection', () => {
    it('uses the loaded pending queue without waiting for a second response', async () => {
        const pendingQueueTab = {
            getAttribute: vi.fn().mockResolvedValue('true'),
            click: vi.fn(),
        };
        const page = {
            getByRole: vi.fn().mockReturnValue(pendingQueueTab),
            waitForResponse: vi.fn().mockRejectedValue(new Error('unexpected second approvals request')),
        };
        const approvals = new ApprovalsPage(page as unknown as Page);
        const waitForApprovalsReady = vi.spyOn(approvals, 'waitForApprovalsReady').mockResolvedValue();

        await approvals.selectPendingQueue();

        expect(page.getByRole).toHaveBeenCalledWith('tab', { name: anyRegExp });
        expect(pendingQueueTab.getAttribute).toHaveBeenCalledWith('aria-selected');
        expect(page.waitForResponse).not.toHaveBeenCalled();
        expect(pendingQueueTab.click).not.toHaveBeenCalled();
        expect(waitForApprovalsReady).toHaveBeenCalledOnce();
    });
});

describe('ApprovalsPage my requests selection', () => {
    it('preserves the loaded My Requests view without waiting for a second response', async () => {
        const myRequestsTab = {
            getAttribute: vi.fn().mockResolvedValue('true'),
            click: vi.fn(),
        };
        const page = {
            getByRole: vi.fn().mockReturnValue(myRequestsTab),
            waitForResponse: vi.fn().mockRejectedValue(new Error('unexpected second approvals request')),
        };
        const approvals = new ApprovalsPage(page as unknown as Page);
        const waitForApprovalsReady = vi.spyOn(approvals, 'waitForApprovalsReady').mockResolvedValue();

        await approvals.selectMyRequests();

        expect(page.getByRole).toHaveBeenCalledWith('tab', { name: anyRegExp });
        expect(myRequestsTab.getAttribute).toHaveBeenCalledWith('aria-selected');
        expect(page.waitForResponse).not.toHaveBeenCalled();
        expect(myRequestsTab.click).not.toHaveBeenCalled();
        expect(waitForApprovalsReady).toHaveBeenCalledOnce();
    });
});

describe('ApprovalsPage history selection', () => {
    it('preserves the loaded History view without waiting for a second response', async () => {
        const historyTab = {
            getAttribute: vi.fn().mockResolvedValue('true'),
            click: vi.fn(),
        };
        const page = {
            getByRole: vi.fn().mockReturnValue(historyTab),
            waitForResponse: vi.fn().mockRejectedValue(new Error('unexpected second approvals request')),
        };
        const approvals = new ApprovalsPage(page as unknown as Page);
        const waitForApprovalsReady = vi.spyOn(approvals, 'waitForApprovalsReady').mockResolvedValue();

        await approvals.selectHistory();

        expect(page.getByRole).toHaveBeenCalledWith('tab', { name: anyRegExp });
        expect(historyTab.getAttribute).toHaveBeenCalledWith('aria-selected');
        expect(page.waitForResponse).not.toHaveBeenCalled();
        expect(historyTab.click).not.toHaveBeenCalled();
        expect(waitForApprovalsReady).toHaveBeenCalledOnce();
    });
});
