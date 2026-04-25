import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { formatDateTimeValue } from '@/i18n/formatters';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import { adminApi } from '@/services/adminApi';

export function LogsPanel() {
    const { t, i18n } = useTranslation('admin');
    const [eventFilter, setEventFilter] = useState<string>('');

    const { data: logs, isLoading } = useQuery({
        queryKey: ['adminLogs', eventFilter],
        queryFn: () => adminApi.getTechnicalLogs({ event_type: eventFilter || undefined, limit: 100 }),
    });

    if (isLoading) {
        return <div className="admin-muted text-center py-8">{t('application_logs.loading')}</div>;
    }

    const eventTypes = [...new Set(logs?.map((log) => log.event_type) || [])];

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

            <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                    <thead className="admin-table-head sticky top-0">
                        <tr className="border-b border-white/10">
                            <th className="admin-muted text-left py-2 px-3 font-medium">{t('application_logs.columns.time')}</th>
                            <th className="admin-muted text-left py-2 px-3 font-medium">{t('application_logs.columns.level')}</th>
                            <th className="admin-muted text-left py-2 px-3 font-medium">{t('application_logs.columns.event')}</th>
                            <th className="admin-muted text-left py-2 px-3 font-medium">{t('application_logs.columns.user')}</th>
                            <th className="admin-muted text-left py-2 px-3 font-medium">{t('application_logs.columns.details')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs?.map((log) => (
                            <tr key={log.id} className="border-b border-white/5 hover:bg-white/5">
                                <td className="admin-subtle whitespace-nowrap py-2 px-3">
                                    {formatDateTimeValue(log.timestamp, i18n.language)}
                                </td>
                                <td className="py-2 px-3">
                                    <span className={cn(
                                        'px-2 py-0.5 rounded text-xs font-medium',
                                        log.level === 'INFO' && 'bg-blue-500/20 text-blue-400',
                                        log.level === 'WARNING' && 'bg-amber-500/20 text-amber-400',
                                        log.level === 'ERROR' && 'bg-red-500/20 text-red-400',
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
        </div>
    );
}
