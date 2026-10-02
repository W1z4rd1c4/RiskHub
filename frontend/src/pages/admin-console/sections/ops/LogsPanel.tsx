import { type ReactNode, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { adminKeys } from '@/lib/queryKeys';
import type { Tone } from '@/lib/tones';
import { adminApi } from '@/services/adminApi';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';

const LOG_LEVEL_TONES: Readonly<Record<string, Tone>> = {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'danger',
};

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
                <h2 className="text-lg font-semibold text-foreground">{t('application_logs.title')}</h2>
                <ThemedSelect
                    triggerAriaLabel={t('application_logs.columns.event')}
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
            <div className="max-h-96 overflow-y-auto">
                <Table density="compact" regionLabel={t('application_logs.title')} className="text-sm">
                    <THead>
                        <TR>
                            <TH>{t('application_logs.columns.time')}</TH>
                            <TH>{t('application_logs.columns.level')}</TH>
                            <TH>{t('application_logs.columns.event')}</TH>
                            <TH>{t('application_logs.columns.user')}</TH>
                            <TH>{t('application_logs.columns.details')}</TH>
                        </TR>
                    </THead>
                    <TBody>
                        {logs?.map((log) => (
                            <TR key={log.id}>
                                <TD className="whitespace-nowrap text-muted-foreground">
                                    {format.dateTime(log.timestamp)}
                                </TD>
                                <TD>
                                    <Badge shape="rounded" tone={LOG_LEVEL_TONES[log.level] ?? 'neutral'}>
                                        {log.level}
                                    </Badge>
                                </TD>
                                <TD className="text-foreground">{log.event_type}</TD>
                                <TD className="text-muted-foreground">{log.user_name || t('common:fallbacks.unknown_user')}</TD>
                                <TD className="max-w-xs truncate text-muted-foreground" title={log.description || ''}>
                                    {log.description || t('common:fallbacks.not_available')}
                                </TD>
                            </TR>
                        ))}
                    </TBody>
                </Table>
            </div>
            )}
        </div>
    );
}
