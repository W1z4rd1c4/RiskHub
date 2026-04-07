import { useEffect, useState } from 'react';

import { activityLogApi } from '@/services/activityLogApi';
import type { ActivityLogEntry } from '@/types/activityLog';
import type { Issue } from '@/types/issue';

import type { IssueDetailTab } from './issueDetail.types';

interface UseIssueHistoryOptions {
    activeTab: IssueDetailTab;
    canViewActivityLog: boolean;
    issue: Issue | null;
}

export function useIssueHistory({
    activeTab,
    canViewActivityLog,
    issue,
}: UseIssueHistoryOptions) {
    const [historyItems, setHistoryItems] = useState<ActivityLogEntry[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const issueId = issue?.id;

    useEffect(() => {
        if (activeTab !== 'history' || !issueId || !canViewActivityLog) {
            setHistoryItems((previous) => (previous.length === 0 ? previous : []));
            setIsHistoryLoading(false);
            return;
        }

        let cancelled = false;
        setIsHistoryLoading(true);
        activityLogApi
            .list({
                entity_type: 'issue',
                entity_id: issueId,
                limit: 100,
            })
            .then((response) => {
                if (!cancelled) {
                    setHistoryItems(response.items);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setHistoryItems((previous) => (previous.length === 0 ? previous : []));
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsHistoryLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [activeTab, canViewActivityLog, issue, issueId]);

    return {
        historyItems,
        isHistoryLoading,
    };
}
