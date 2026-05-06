import type { RecentLogEntry } from '@/services/adminApi';
import { cn } from '@/lib/utils';
import { formatDateTimeValue } from '@/i18n/formatters';

import { formatAuditEvent, formatAuditUser, getAuditEventClassName } from './auditPresentation';

interface AuditLogsTableProps {
    logs: RecentLogEntry[];
    language: string;
    resolveUserName?: (userId: number) => string | null | undefined;
    t: (key: string, options?: Record<string, unknown>) => string;
    onViewDetails: (extra: Record<string, unknown>) => void;
}

export function AuditLogsTable({ logs, language, resolveUserName, t, onViewDetails }: AuditLogsTableProps) {
    return (
        <div className="overflow-x-auto border border-white/10 rounded-xl">
            <table className="w-full text-sm text-left">
                <thead className="admin-table-head">
                    <tr className="border-b border-white/10">
                        <th className="py-3 px-4 font-medium">{t('audit.columns.timestamp')}</th>
                        <th className="py-3 px-4 font-medium">{t('audit.columns.event')}</th>
                        <th className="py-3 px-4 font-medium">{t('audit.columns.user')}</th>
                        <th className="py-3 px-4 font-medium">{t('audit.columns.client_ip')}</th>
                        <th className="py-3 px-4 font-medium text-right">{t('audit.columns.details')}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {logs.length === 0 ? (
                        <tr>
                            <td colSpan={5} className="admin-subtle py-8 text-center">
                                {t('audit.no_events')}
                            </td>
                        </tr>
                    ) : (
                        logs.map((log, index) => (
                            <tr key={`${log.timestamp}-${index}`} className="hover:bg-white/5 transition-colors">
                                <td className="admin-muted whitespace-nowrap py-3 px-4">
                                    {log.timestamp ? formatDateTimeValue(log.timestamp, language) : t('common:fallbacks.not_available')}
                                </td>
                                <td className="py-3 px-4">
                                    <span className={cn(
                                        'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
                                        getAuditEventClassName(log.event),
                                    )}>
                                        {formatAuditEvent(log.event, t('common:fallbacks.unknown'))}
                                    </span>
                                </td>
                                <td className="admin-title py-3 px-4 font-medium">
                                    {formatAuditUser(
                                        log.user_id,
                                        t('common:fallbacks.system'),
                                        t('common:fallbacks.unknown_user'),
                                        resolveUserName,
                                    )}
                                </td>
                                <td className="admin-subtle py-3 px-4 font-mono text-xs">
                                    {log.client_ip || t('common:fallbacks.not_available')}
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <button
                                        className="text-xs text-accent hover:underline"
                                        onClick={() => onViewDetails(log.extra || {})}
                                    >
                                        {t('audit.view')}
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
