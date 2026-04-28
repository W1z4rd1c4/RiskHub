import { useQuery } from '@tanstack/react-query';

import { issueHistoryQueryKey } from '@/lib/issueQueryKeys';
import { activityLogApi } from '@/services/activityLogApi';
import { useSessionSnapshot } from '@/services/session';
import type { Issue } from '@/types/issue';

import type { IssueDetailTab } from './issueDetail.types';

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
    const historyQuery = useQuery({
        queryKey: issueHistoryQueryKey(session.user?.id, issueId),
        enabled: activeTab === 'history' && !!issueId && canViewActivityHistory,
        queryFn: ({ signal }) =>
            activityLogApi.list(
                {
                    entity_type: 'issue',
                    entity_id: issueId,
                    limit: 100,
                },
                { signal },
            ),
        staleTime: 30_000,
    });

    const historyItems = historyQuery.data?.items ?? [];
    const isHistoryLoading = historyQuery.isLoading;

    return {
        historyItems,
        isHistoryLoading,
        refreshHistory: historyQuery.refetch,
    };
}
