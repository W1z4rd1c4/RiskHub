import { Pagination } from '@/components/tables/Pagination';
import { Card } from '@/components/ui/card';
import { AccessDeniedState, EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import { useFormat, type SafeTFunction } from '@/i18n/hooks';
import type { ActivityLogEntry } from '@/types/activityLog';

interface IssueHistoryTabProps {
    canViewActivityHistory: boolean;
    historyItems: ActivityLogEntry[];
    isHistoryLoading: boolean;
    historyLoadFailed?: boolean;
    isHistoryRefetching?: boolean;
    onRetryHistory?: () => void;
    /** GAP-C-11: server paging of the history (1-based page, total entries, page size). */
    historyPage?: number;
    historyTotal?: number;
    historyPageSize?: number;
    onHistoryPageChange?: (page: number) => void;
    t: SafeTFunction;
}

/** Literal keys so the i18n usage validator sees every action label (PG-03 / GAP-D-02). */
const ISSUE_HISTORY_ACTION_KEYS: Readonly<Record<string, string>> = {
    create: 'issues:detail.history_actions.create',
    update: 'issues:detail.history_actions.update',
    delete: 'issues:detail.history_actions.delete',
    archive: 'issues:detail.history_actions.archive',
    restore: 'issues:detail.history_actions.restore',
    approve: 'issues:detail.history_actions.approve',
    reject: 'issues:detail.history_actions.reject',
    cancel: 'issues:detail.history_actions.cancel',
    status_change: 'issues:detail.history_actions.status_change',
    link: 'issues:detail.history_actions.link',
    unlink: 'issues:detail.history_actions.unlink',
    comment: 'issues:detail.history_actions.comment',
};

export function IssueHistoryTab({
    canViewActivityHistory,
    historyItems,
    isHistoryLoading,
    historyLoadFailed = false,
    isHistoryRefetching = false,
    onRetryHistory,
    historyPage = 1,
    historyTotal = 0,
    historyPageSize = 0,
    onHistoryPageChange,
    t,
}: IssueHistoryTabProps) {
    const format = useFormat();
    const historyTotalPages = historyPageSize > 0 ? Math.ceil(historyTotal / historyPageSize) : 1;
    const showPagination = Boolean(onHistoryPageChange) && historyTotalPages > 1;
    return (
        <Card as="section" className="space-y-4" data-testid="issue-history-panel">
            {!canViewActivityHistory ? (
                <AccessDeniedState layout="section" descriptionKey="permissions.history_denied" ns="issues" />
            ) : isHistoryLoading ? (
                <LoadingState layout="inline" label={t('detail.messages.loading_history')} />
            ) : historyLoadFailed ? (
                <ErrorState layout="inline" onRetry={onRetryHistory} isRetrying={isHistoryRefetching} />
            ) : historyItems.length === 0 ? (
                <EmptyState layout="inline" icon={null} title={t('detail.messages.no_history')} />
            ) : (
                <>
                    <ul className="space-y-2">
                        {historyItems.map((entry) => (
                            <li key={entry.id} className="rounded-xl border border-border bg-nested px-4 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-foreground">
                                        {ISSUE_HISTORY_ACTION_KEYS[entry.action]
                                            ? t(ISSUE_HISTORY_ACTION_KEYS[entry.action])
                                            : t('issues:detail.history_actions.other')}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {format.dateTime(entry.created_at) || t('common:fallbacks.not_set')}
                                    </p>
                                </div>
                                <p className="text-sm text-foreground mt-1">{entry.description}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {entry.actor_name || t('detail.messages.system')}
                                </p>
                            </li>
                        ))}
                    </ul>
                    {showPagination && onHistoryPageChange ? (
                        <Pagination
                            currentPage={historyPage}
                            totalPages={historyTotalPages}
                            totalItems={historyTotal}
                            itemsPerPage={historyPageSize}
                            onPageChange={onHistoryPageChange}
                            isLoading={isHistoryRefetching}
                        />
                    ) : null}
                </>
            )}
        </Card>
    );
}
