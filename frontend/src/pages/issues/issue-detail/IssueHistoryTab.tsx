import { useFormat, type SafeTFunction } from '@/i18n/hooks';
import type { ActivityLogEntry } from '@/types/activityLog';

interface IssueHistoryTabProps {
    canViewActivityHistory: boolean;
    historyItems: ActivityLogEntry[];
    isHistoryLoading: boolean;
    t: SafeTFunction;
}

export function IssueHistoryTab({
    canViewActivityHistory,
    historyItems,
    isHistoryLoading,
    t,
}: IssueHistoryTabProps) {
    const format = useFormat();
    return (
        <section className="glass-card p-6 space-y-4" data-testid="issue-history-panel">
            {!canViewActivityHistory ? (
                <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-text">
                    {t('permissions.history_denied')}
                </div>
            ) : isHistoryLoading ? (
                <p className="text-sm text-muted-foreground">{t('detail.messages.loading_history')}</p>
            ) : historyItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('detail.messages.no_history')}</p>
            ) : (
                <ul className="space-y-2">
                    {historyItems.map((entry) => (
                        <li key={entry.id} className="rounded-xl border border-border bg-tint/5 px-4 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-foreground">
                                    {entry.action.replaceAll('_', ' ')}
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
