import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, RefreshCw } from 'lucide-react';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import { adminApi } from '@/services/adminApi';
import { lookupApi } from '@/services/lookupApi';

import { AuditDetailsModal } from './AuditDetailsModal';
import { AuditLogsTable } from './AuditLogsTable';
import { exportAuditLogsToCsv, exportAuditLogsToJson } from './auditExport';
import { getAuditEventTypes } from './auditPresentation';
import { LogSettingsPanel } from './LogSettingsPanel';

const AUDIT_USER_LOOKUP_CHUNK_SIZE = 200;

export function AuditLogsPanel() {
    const { t, i18n } = useTranslation('admin');
    const [lines, setLines] = useState<number>(100);
    const [eventFilter, setEventFilter] = useState<string>('');
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [selectedLogExtra, setSelectedLogExtra] = useState<Record<string, unknown> | null>(null);

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['adminAuditLogs', lines, eventFilter],
        queryFn: () => adminApi.getAuditLogs({ lines, event_type: eventFilter || undefined }),
        refetchInterval: autoRefresh ? 5000 : false,
    });
    const logs = useMemo(() => data?.entries || [], [data?.entries]);
    const auditUserIds = useMemo(
        () => [...new Set(logs.map((log) => log.user_id).filter((userId): userId is number => userId !== null))]
            .sort((a, b) => a - b),
        [logs],
    );
    const { data: auditUsers } = useQuery({
        queryKey: ['adminAuditLogUsers', auditUserIds],
        queryFn: async () => {
            const chunks = [];
            for (let index = 0; index < auditUserIds.length; index += AUDIT_USER_LOOKUP_CHUNK_SIZE) {
                chunks.push(auditUserIds.slice(index, index + AUDIT_USER_LOOKUP_CHUNK_SIZE));
            }
            const batches = await Promise.all(
                chunks.map((ids) => lookupApi.getUsers({ ids, include_inactive: true })),
            );
            return batches.flat();
        },
        enabled: auditUserIds.length > 0,
    });
    const auditUserNameById = useMemo(
        () => new Map((auditUsers ?? []).map((user) => [user.id, user.name])),
        [auditUsers],
    );
    const { data: capabilities } = useQuery({
        queryKey: ['adminCapabilities'],
        queryFn: () => adminApi.getCapabilities(),
    });

    if (isLoading && !data) {
        return <div className="admin-muted text-center py-8">{t('application_logs.loading')}</div>;
    }

    const eventTypes = getAuditEventTypes(logs);
    const canExportLoadedAuditLogs = capabilities?.can_export_loaded_audit_logs === true;
    const canUpdateLogConfig = capabilities?.can_update_log_config === true;

    return (
        <div className="space-y-4">
            <LogSettingsPanel canUpdateLogConfig={canUpdateLogConfig} />

            <div className="flex flex-wrap items-center justify-between gap-4 py-2">
                <div className="flex items-center gap-4">
                    <h3 className="admin-title text-lg font-semibold">{t('audit.event_feed')}</h3>
                    <div className="admin-surface-muted flex items-center gap-2 rounded-full border px-3 py-1">
                        <div className={cn('w-2 h-2 rounded-full', autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500')} />
                        <span className="admin-muted text-xs">{t('audit.live')}</span>
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(event) => setAutoRefresh(event.target.checked)}
                            className="form-checkbox h-3 w-3 text-accent rounded bg-slate-800 border-white/10"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <ThemedSelect
                        value={eventFilter}
                        onValueChange={setEventFilter}
                        placeholder={t('audit.all_events')}
                        allowEmpty
                        emptyLabel={t('audit.all_events')}
                        options={eventTypes.map((type) => ({ value: type, label: type.replace(/_/g, ' ') }))}
                    />

                    <ThemedSelect
                        value={lines.toString()}
                        onValueChange={(value) => setLines(parseInt(value))}
                        options={[
                            { value: '50', label: t('audit.last_n', { count: 50 }) },
                            { value: '100', label: t('audit.last_n', { count: 100 }) },
                            { value: '200', label: t('audit.last_n', { count: 200 }) },
                            { value: '500', label: t('audit.last_n', { count: 500 }) },
                        ]}
                    />

                    {canExportLoadedAuditLogs && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => exportAuditLogsToCsv(logs)}
                                className="admin-surface-muted admin-text flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-white/10"
                                title={t('console.export_csv')}
                            >
                                <FileDown className="h-4 w-4" />
                                CSV
                            </button>
                            <button
                                onClick={() => exportAuditLogsToJson(logs)}
                                className="admin-surface-muted admin-text flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-white/10"
                                title={t('console.export_json')}
                            >
                                <FileDown className="h-4 w-4" />
                                JSON
                            </button>
                        </div>
                    )}

                    <button
                        onClick={() => refetch()}
                        className="admin-tab-inactive rounded-lg p-2 transition-colors hover:bg-white/5"
                        title={t('console.manual_refresh')}
                    >
                        <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                    </button>
                </div>
            </div>

            <AuditLogsTable
                logs={logs}
                language={i18n.language}
                resolveUserName={(userId) => auditUserNameById.get(userId)}
                t={t}
                onViewDetails={setSelectedLogExtra}
            />

            <AuditDetailsModal extra={selectedLogExtra} onClose={() => setSelectedLogExtra(null)} />
        </div>
    );
}
