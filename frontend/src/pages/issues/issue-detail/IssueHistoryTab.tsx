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
    t,
}: IssueHistoryTabProps) {
    const format = useFormat();
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
                                    {format.dateTime(entry.created_at) || t('fallbacks.not_set')}
                                </p>
                            </div>
                            <p className="text-sm text-foreground mt-1">{entry.description}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {entry.actor_name || t('detail.messages.system')}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}
