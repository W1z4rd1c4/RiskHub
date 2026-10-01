import { type ReactNode, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { adminKeys } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';
import { adminApi } from '@/services/adminApi';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';

export function LogsPanel() {
    const { t } = useTranslation('admin');
    const format = useFormat();
    const [eventFilter, setEventFilter] = useState<string>('');
    const [eventTypes, setEventTypes] = useState<string[]>([]);

    const limit = 100;
    const { data: eventVocabulary, isError: isEventVocabularyError } = useQuery({
        queryKey: adminKeys.logEventTypes(limit),
        queryFn: () => adminApi.getTechnicalLogs({ event_type: undefined, limit }),
    });
    const {
        data: logs,
        isLoading,
        isError: isLogsError,
        isFetching: isLogsFetching,
        refetch: refetchLogs,
    } = useQuery({
        queryKey: adminKeys.logs(eventFilter),
        queryFn: () => adminApi.getTechnicalLogs({ event_type: eventFilter || undefined, limit }),
    });

    useEffect(() => {
        if (eventVocabulary) {
            setEventTypes([...new Set(eventVocabulary.map((log) => log.event_type))]);
            return;
        }
        if (isEventVocabularyError && !eventFilter && logs) {
            setEventTypes([...new Set(logs.map((log) => log.event_type))]);
        }
    }, [eventFilter, eventVocabulary, isEventVocabularyError, logs]);

    if (isLoading && !eventVocabulary && eventTypes.length === 0) {
        return <LoadingState label={t('application_logs.loading')} />;
    }

    const retryLogs = () => void refetchLogs();
    let logsRegion: ReactNode = null;
    if (isLoading) {
        logsRegion = <LoadingState label={t('application_logs.loading')} />;
    } else if (isLogsError && !logs) {
        logsRegion = <ErrorState title={t('application_logs.title')} onRetry={retryLogs} isRetrying={isLogsFetching} />;
    } else if (!logs || logs.length === 0) {
        logsRegion = <EmptyState title={t('common:empty.no_data')} />;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="admin-title text-lg font-semibold">{t('application_logs.title')}</h3>
                <ThemedSelect
                    value={eventFilter}
                    onValueChange={setEventFilter}
                    placeholder={t('application_logs.all_events')}
                    allowEmpty
                    emptyLabel={t('application_logs.all_events')}
                    options={eventTypes.map((type) => ({ value: type, label: type }))}
                />
            </div>

            {isLogsError && logs ? (
                <ErrorState variant="banner" onRetry={retryLogs} isRetrying={isLogsFetching} />
            ) : null}

            {logsRegion ?? (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                    <thead className="admin-table-head sticky top-0">
                        <tr className="border-b border-border">
                            <th className="admin-muted text-left py-2 px-3 font-medium">{t('application_logs.columns.time')}</th>
                            <th className="admin-muted text-left py-2 px-3 font-medium">{t('application_logs.columns.level')}</th>
                            <th className="admin-muted text-left py-2 px-3 font-medium">{t('application_logs.columns.event')}</th>
                            <th className="admin-muted text-left py-2 px-3 font-medium">{t('application_logs.columns.user')}</th>
                            <th className="admin-muted text-left py-2 px-3 font-medium">{t('application_logs.columns.details')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs?.map((log) => (
                            <tr key={log.id} className="border-b border-border hover:bg-tint/5">
                                <td className="admin-subtle whitespace-nowrap py-2 px-3">
                                    {format.dateTime(log.timestamp)}
                                </td>
                                <td className="py-2 px-3">
                                    <span className={cn(
                                        'px-2 py-0.5 rounded text-xs font-medium',
                                        log.level === 'INFO' && 'bg-info/10 text-accent-text',
                                        log.level === 'WARNING' && 'bg-warning/10 text-warning-text',
                                        log.level === 'ERROR' && 'bg-destructive/10 text-destructive',
                                    )}>
                                        {log.level}
                                    </span>
                                </td>
                                <td className="admin-title py-2 px-3">{log.event_type}</td>
                                <td className="admin-muted py-2 px-3">{log.user_name || t('common:fallbacks.unknown_user')}</td>
                                <td className="admin-subtle max-w-xs truncate py-2 px-3" title={log.description || ''}>
                                    {log.description || t('common:fallbacks.not_available')}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            )}
        </div>
    );
}
