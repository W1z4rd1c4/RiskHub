import { useQuery } from '@tanstack/react-query';

import { issueDetailQueryKey } from '@/lib/issueQueryKeys';
import { apiClient, isForbiddenApiError } from '@/services/apiClient';
import { issuesApi } from '@/services/issuesApi';
import { useSessionSnapshot } from '@/services/session';

interface UseIssueDetailOptions {
    issueId: number;
}

export function useIssueDetail({ issueId }: UseIssueDetailOptions) {
    const session = useSessionSnapshot();
    const hasValidIssueId = Number.isFinite(issueId) && issueId > 0;
    const issueQuery = useQuery({
        queryKey: issueDetailQueryKey(session.user?.id, issueId),
        enabled: hasValidIssueId,
        queryFn: ({ signal }) => issuesApi.get(issueId, { signal }),
        staleTime: 30_000,
    });

    const issue = issueQuery.data ?? null;
    const isAccessDenied = isForbiddenApiError(issueQuery.error);
    const errorKey = !hasValidIssueId
        ? 'errors.not_found'
        : issueQuery.error && !issue && !isAccessDenied
            ? apiClient.toUiMessageKey(issueQuery.error)
            : null;

    return {
        errorKey,
        refreshIssue: issueQuery.refetch,
        isAccessDenied,
        isLoading: issueQuery.isLoading,
        issue,
    };
}
