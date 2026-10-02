import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { issueHistoryPageQueryKey } from '@/lib/queryKeys/issues';
import { activityLogApi } from '@/services/activityLogApi';
import { useSessionSnapshot } from '@/services/session';
import type { Issue } from '@/types/issue';

import type { IssueDetailTab } from './issueDetail.types';

/** GAP-C-11: issue history is paged through the shared `Pagination` (no fixed `limit: 100`). */
export const ISSUE_HISTORY_PAGE_SIZE = 25;

interface UseIssueHistoryOptions {
    activeTab: IssueDetailTab;
    canViewActivityHistory: boolean;
    issue: Issue | null;
}

export function useIssueHistory({
    activeTab,
    canViewActivityHistory,
    issue,
}: UseIssueHistoryOptions) {
    const session = useSessionSnapshot();
    const issueId = issue?.id;
    // The page belongs to one issue: a different issue starts on its newest page again.
    const [pageState, setPageState] = useState<{ issueId: number | undefined; page: number }>({ issueId, page: 1 });
    const historyPage = pageState.issueId === issueId ? pageState.page : 1;
    const setHistoryPage = useCallback((page: number) => setPageState({ issueId, page }), [issueId]);

    const historyQuery = useQuery({
        queryKey: issueHistoryPageQueryKey(session.user?.id, issueId, historyPage),
        enabled: activeTab === 'history' && !!issueId && canViewActivityHistory,
        queryFn: ({ signal }) =>
            activityLogApi.list(
                {
                    entity_type: 'issue',
                    entity_id: issueId,
                    skip: (historyPage - 1) * ISSUE_HISTORY_PAGE_SIZE,
                    limit: ISSUE_HISTORY_PAGE_SIZE,
                },
                { signal },
            ),
        // Keep the shown page while the next one loads, but never show another issue's history.
        placeholderData: (previousData, previousQuery) =>
            previousQuery?.queryKey[2] === issueId ? previousData : undefined,
        staleTime: 30_000,
    });

    const historyItems = historyQuery.data?.items ?? [];
    const historyTotal = historyQuery.data?.total ?? 0;
    const isHistoryLoading = historyQuery.isLoading;

    return {
        historyItems,
        isHistoryLoading,
        // GAP-C-11 / PG-21: a failed first load is an error with retry, never "no history".
        historyLoadFailed: historyQuery.isError && !historyQuery.data,
        isHistoryRefetching: historyQuery.isFetching,
        refreshHistory: historyQuery.refetch,
        historyPage,
        historyTotal,
        setHistoryPage,
    };
}
