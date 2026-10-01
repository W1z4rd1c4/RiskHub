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

function humanizeAction(action: string): string {
    return action.replaceAll('_', ' ');
}

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
        <section className="glass-card p-6 space-y-4" data-testid="issue-history-panel">
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
                        <li key={entry.id} className="rounded-xl border border-border bg-tint/5 px-4 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-foreground">
                                    {t(`detail.history_actions.${entry.action}`, { defaultValue: humanizeAction(entry.action) })}
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
        </section>
    );
}
