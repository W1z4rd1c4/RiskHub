import { useQuery } from '@tanstack/react-query';

import { issueDetailQueryKey } from '@/lib/issueQueryKeys';
import { apiClient } from '@/services/apiClient';
import { issuesApi } from '@/services/issuesApi';
import { useSessionSnapshot } from '@/services/session';

interface UseIssueDetailOptions {
    canRead: boolean;
    issueId: number;
}

export function useIssueDetail({ canRead, issueId }: UseIssueDetailOptions) {
    const session = useSessionSnapshot();
    const hasValidIssueId = Number.isFinite(issueId) && issueId > 0;
    const issueQuery = useQuery({
        queryKey: issueDetailQueryKey(session.user?.id, issueId),
        enabled: canRead && hasValidIssueId,
        queryFn: ({ signal }) => issuesApi.get(issueId, { signal }),
        staleTime: 30_000,
    });

    const issue = issueQuery.data ?? null;
    const isLoading = canRead ? issueQuery.isLoading : false;
    const errorKey = !hasValidIssueId
        ? 'errors.not_found'
        : issueQuery.error && !issue
            ? apiClient.toUiMessageKey(issueQuery.error)
            : null;

    return {
        errorKey,
        refreshIssue: issueQuery.refetch,
        isLoading,
        issue,
    };
}
