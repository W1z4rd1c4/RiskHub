import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePendingApprovalIds } from '@/hooks/usePendingApprovalIds';

const approvalsApiMock = vi.hoisted(() => ({
    list: vi.fn(),
}));

vi.mock('@/services/approvalsApi', () => ({
    approvalsApi: approvalsApiMock,
}));

vi.mock('@/services/logger', () => ({
    logError: vi.fn(),
}));

describe('usePendingApprovalIds', () => {
    beforeEach(() => {
        approvalsApiMock.list.mockReset();
    });

    it('collects matching IDs across pages and excludes creation approvals without an ID', async () => {
        approvalsApiMock.list
            .mockResolvedValueOnce({
                items: [
                    { resource_type: 'risk', resource_id: 17 },
                    { resource_type: 'risk', resource_id: null },
                ],
                total: 101,
                skip: 0,
                limit: 100,
            })
            .mockResolvedValueOnce({
                items: [
                    { resource_type: 'risk', resource_id: 29 },
                    { resource_type: 'control', resource_id: 31 },
                ],
                total: 101,
                skip: 100,
                limit: 100,
            });

        const { result } = renderHook(() => usePendingApprovalIds('risk'));

        await waitFor(() => {
            expect(result.current).toEqual(new Set([17, 29]));
        });
        expect(approvalsApiMock.list).toHaveBeenNthCalledWith(2, {
            status: 'pending',
            limit: 100,
            skip: 100,
        });
    });
});
