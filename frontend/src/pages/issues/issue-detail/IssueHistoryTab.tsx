import type { SafeTFunction } from '@/i18n/hooks';
import type { ActivityLogEntry } from '@/types/activityLog';

import { formatDateTime } from './issueDetail.formatters';

interface IssueHistoryTabProps {
    canViewActivityLog: boolean;
    historyItems: ActivityLogEntry[];
    isHistoryLoading: boolean;
    locale: string;
    t: SafeTFunction;
}

export function IssueHistoryTab({
    canViewActivityLog,
    historyItems,
    isHistoryLoading,
    locale,
    t,
}: IssueHistoryTabProps) {
    return (
        <section className="glass-card p-6 space-y-4" data-testid="issue-history-panel">
            {!canViewActivityLog ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                    {t('permissions.history_denied')}
                </div>
            ) : isHistoryLoading ? (
                <p className="text-sm text-slate-400">{t('detail.messages.loading_history')}</p>
            ) : historyItems.length === 0 ? (
                <p className="text-sm text-slate-400">{t('detail.messages.no_history')}</p>
            ) : (
                <ul className="space-y-2">
                    {historyItems.map((entry) => (
                        <li key={entry.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-slate-300">
                                    {entry.action.replaceAll('_', ' ')}
                                </p>
                                <p className="text-xs text-slate-500">
                                    {formatDateTime(entry.created_at, locale, t('fallbacks.not_set'))}
                                </p>
                            </div>
                            <p className="text-sm text-slate-300 mt-1">{entry.description}</p>
                            <p className="text-xs text-slate-500 mt-1">
                                {entry.actor_name || t('detail.messages.system')}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
