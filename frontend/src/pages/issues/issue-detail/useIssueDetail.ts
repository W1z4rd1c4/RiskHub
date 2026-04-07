import { useCallback, useEffect, useState } from 'react';

import { apiClient } from '@/services/apiClient';
import { issuesApi } from '@/services/issuesApi';
import type { Issue } from '@/types/issue';

interface UseIssueDetailOptions {
    canRead: boolean;
    issueId: number;
}

export function useIssueDetail({ canRead, issueId }: UseIssueDetailOptions) {
    const [issue, setIssue] = useState<Issue | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    const fetchIssue = useCallback(async () => {
        if (!Number.isFinite(issueId) || issueId <= 0) {
            setErrorKey('errors.not_found');
            setIssue(null);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const response = await issuesApi.get(issueId);
            setIssue(response);
            setErrorKey(null);
        } catch (loadError) {
            setErrorKey(apiClient.toUiMessageKey(loadError));
            setIssue(null);
        } finally {
            setIsLoading(false);
        }
    }, [issueId]);

    useEffect(() => {
        if (!canRead) {
            setIsLoading(false);
            return;
        }
        void fetchIssue();
    }, [canRead, fetchIssue]);

    return {
        errorKey,
        fetchIssue,
        isLoading,
        issue,
        setIssue,
    };
}
