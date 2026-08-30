import { useCallback } from 'react';

import { useDetailQuery } from '@/pages/detail/useDetailQuery';
import { issuesApi } from '@/services/issuesApi';

interface UseIssueDetailOptions {
    rawId: string | undefined;
}

export function useIssueDetail({ rawId }: UseIssueDetailOptions) {
    const loadIssue = useCallback((issueId: number, signal?: AbortSignal) => issuesApi.get(issueId, { signal }), []);
    const {
        isRetrying,
        loadOutcome,
        refetch,
        resource: issue,
        resourceId: issueId,
    } = useDetailQuery({ entity: 'issue', rawId, load: loadIssue });

    return {
        isRetrying,
        issue,
        issueId,
        loadOutcome,
        refreshIssue: refetch,
    };
}
