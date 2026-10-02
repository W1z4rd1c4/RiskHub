import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@test/queryClient';
import { ISSUE_HISTORY_PAGE_SIZE, useIssueHistory } from '@/pages/issues/issue-detail/useIssueHistory';
import { __resetSessionStoreForTests, setSessionSnapshot } from '@/services/session/store';
import type { Issue } from '@/types/issue';

const mockListActivity = vi.fn();

vi.mock('@/services/activityLogApi', () => ({
    activityLogApi: {
        list: (...args: unknown[]) => mockListActivity(...args),
    },
}));

function historyEntry(issueId: number, id: number) {
    return {
        id,
        action: 'update',
        entity_type: 'issue',
        entity_id: issueId,
        description: `Issue ${issueId} entry ${id}`,
        actor_name: 'Analyst',
        created_at: '2026-10-01T08:00:00Z',
    };
}

function setAuthenticatedSession() {
    setSessionSnapshot({
        token: 'token-7',
        user: {
            id: 7,
            email: '7@riskhub.test',
            name: 'Analyst',
            role: 'administrator',
            role_display_name: 'Administrator',
            department_id: null,
            department_name: null,
            permissions: [],
            effective_permissions: [],
            access_scope: 'global',
            scope_label: 'Global',
        },
        bootstrapStatus: 'authenticated',
        bootstrapError: null,
        logoutPending: false,
        logoutErrorKey: null,
        lastUpdatedAt: Date.now(),
    });
}

describe('useIssueHistory paging (GAP-C-11)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetSessionStoreForTests();
        setAuthenticatedSession();
    });

    it('never shows the previous issue’s history while the next issue’s first page loads', async () => {
        let releaseIssueTwo: (() => void) | undefined;
        mockListActivity.mockImplementation((filters: { entity_id: number; skip: number }) => {
            const page = { items: [historyEntry(filters.entity_id, filters.skip + 1)], total: 60, skip: filters.skip, limit: ISSUE_HISTORY_PAGE_SIZE };
            if (filters.entity_id === 2) {
                return new Promise((resolve) => {
                    releaseIssueTwo = () => resolve(page);
                });
            }
            return Promise.resolve(page);
        });
        const queryClient = createTestQueryClient();
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        );
        const { result, rerender } = renderHook(
            ({ issueId }: { issueId: number }) => useIssueHistory({
                activeTab: 'history',
                canViewActivityHistory: true,
                issue: { id: issueId } as Issue,
            }),
            { initialProps: { issueId: 1 }, wrapper },
        );

        await waitFor(() => expect(result.current.historyItems[0]?.description).toBe('Issue 1 entry 1'));
        act(() => result.current.setHistoryPage(2));
        await waitFor(() => expect(result.current.historyItems[0]?.description).toBe('Issue 1 entry 26'));
        expect(mockListActivity).toHaveBeenLastCalledWith(
            expect.objectContaining({ entity_id: 1, skip: ISSUE_HISTORY_PAGE_SIZE, limit: ISSUE_HISTORY_PAGE_SIZE }),
            expect.anything(),
        );

        rerender({ issueId: 2 });

        expect(result.current.historyPage).toBe(1);
        expect(result.current.historyItems).toEqual([]);
        await waitFor(() => expect(releaseIssueTwo).toBeDefined());
        act(() => releaseIssueTwo?.());
        await waitFor(() => expect(result.current.historyItems[0]?.description).toBe('Issue 2 entry 1'));
    });
});
