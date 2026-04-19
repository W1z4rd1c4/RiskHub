import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/i18n/hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, FileDown, Settings2, Copy, Check } from 'lucide-react';

import { adminApi, type LogConfig } from '@/services/adminApi';
import { cn } from '@/lib/utils';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { formatDateTimeValue } from '@/i18n/formatters';

function LogSettingsPanel() {
    const { t } = useTranslation('admin');
    const queryClient = useQueryClient();
    const [showSavedNotice, setShowSavedNotice] = useState(false);
    const { data: config, isLoading } = useQuery({
        queryKey: ['logConfig'],
        queryFn: () => adminApi.getLogConfig(),
    });

    const mutation = useMutation({
        mutationFn: (newConfig: LogConfig) => adminApi.updateLogConfig(newConfig),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['logConfig'] });
            setShowSavedNotice(true);
        },
    });

    const [form, setForm] = useState<LogConfig | null>(null);

    // Sync form with data
    if (config && !form && !isLoading) {
        setForm(config);
    }

    useEffect(() => {
        if (!showSavedNotice) return;
        const timeout = window.setTimeout(() => setShowSavedNotice(false), 3500);
        return () => window.clearTimeout(timeout);
    }, [showSavedNotice]);

    if (isLoading || !form) return null;

    return (
        <div className="admin-surface-muted mb-6 rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-4">
                <Settings2 className="h-5 w-5 text-accent" />
                <h4 className="admin-title font-medium">{t('audit.title')}</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="admin-surface-elevated space-y-4 rounded-xl border p-4">
                    <h5 className="admin-title text-sm font-semibold">{t('tabs.application_logs')}</h5>
                    <div className="space-y-2">
                        <label className="admin-muted text-sm">{t('audit.max_file_size')}</label>
                        <input
                            type="number"
                            value={form.app_log_rotation_size_mb}
                            onChange={(e) => setForm({ ...form, app_log_rotation_size_mb: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-accent"
                            min="1"
                            max="500"
                        />
                        <p className="admin-subtle text-xs">{t('audit.max_file_size_hint')}</p>
                    </div>
                    <div className="space-y-2">
                        <label className="admin-muted text-sm">{t('audit.retention_count')}</label>
                        <input
                            type="number"
                            value={form.app_log_retention_count}
                            onChange={(e) => setForm({ ...form, app_log_retention_count: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-accent"
                            min="1"
                            max="500"
                        />
                        <p className="admin-subtle text-xs">{t('audit.retention_count_hint')}</p>
                    </div>
                </div>

                <div className="admin-surface-elevated space-y-4 rounded-xl border p-4">
                    <h5 className="admin-title text-sm font-semibold">{t('tabs.audit_logs')}</h5>
                    <div className="space-y-2">
                        <label className="admin-muted text-sm">{t('audit.max_file_size')}</label>
                        <input
                            type="number"
                            value={form.audit_log_rotation_size_mb}
                            onChange={(e) => setForm({ ...form, audit_log_rotation_size_mb: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-accent"
                            min="1"
                            max="500"
                        />
                        <p className="admin-subtle text-xs">{t('audit.max_file_size_hint')}</p>
                    </div>
                    <div className="space-y-2">
                        <label className="admin-muted text-sm">{t('audit.retention_count')}</label>
                        <input
                            type="number"
                            value={form.audit_log_retention_count}
                            onChange={(e) => setForm({ ...form, audit_log_retention_count: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-accent"
                            min="1"
                            max="500"
                        />
                        <p className="admin-subtle text-xs">{t('audit.retention_count_hint')}</p>
                    </div>
                </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
                <div className="space-y-1">
                    <p className="text-xs text-amber-500/80 italic">
                        {t('audit.note')}
                    </p>
                    {showSavedNotice && (
                        <p className="text-xs text-emerald-400 font-medium">
                            {t('audit.settings_saved_notice')}
                        </p>
                    )}
                </div>
                <button
                    onClick={() => mutation.mutate(form)}
                    disabled={mutation.isPending}
                    className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
                >
                    {mutation.isPending ? t('audit.saving') : t('audit.save_settings')}
                </button>
            </div>
        </div>
    );
}

export function AuditLogsPanel() {
    const { t, i18n } = useTranslation('admin');
    const [lines, setLines] = useState<number>(100);
    const [eventFilter, setEventFilter] = useState<string>('');
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [selectedLogExtra, setSelectedLogExtra] = useState<Record<string, unknown> | null>(null);
    const [copied, setCopied] = useState(false);

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['adminAuditLogs', lines, eventFilter],
        queryFn: () => adminApi.getAuditLogs({ lines, event_type: eventFilter || undefined }),
        refetchInterval: autoRefresh ? 5000 : false,
    });

    const exportToCSV = () => {
        if (!data?.entries.length) return;
        const quoteCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const headers = ["Timestamp", "Level", "Event", "User ID", "IP", "Request ID", "Details"];
        const rows = data.entries.map(e => [
            e.timestamp,
            e.level,
            e.event,
            e.user_id,
            e.client_ip,
            e.request_id,
            JSON.stringify(e.extra)
        ]);

        const csvContent = [headers, ...rows].map((row) => row.map(quoteCsv).join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `riskhub_audit_logs_${new Date().toISOString()}.csv`;
        link.click();
    };

    const exportToJSON = () => {
        if (!data?.entries.length) return;
        const blob = new Blob([JSON.stringify(data.entries, null, 2)], { type: 'application/json' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `riskhub_audit_logs_${new Date().toISOString()}.json`;
        link.click();
    };

    if (isLoading && !data) {
        return <div className="admin-muted text-center py-8">{t('application_logs.loading')}</div>;
    }

    const logs = data?.entries || [];
    const eventTypes = [...new Set(logs.map(l => l.event || ''))].filter(Boolean);
    const detailsJson = selectedLogExtra ? JSON.stringify(selectedLogExtra, null, 2) : '';

    const copyDetails = async () => {
        if (!detailsJson) return;
        try {
            await navigator.clipboard.writeText(detailsJson);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch (err) {
            console.error('Failed to copy audit log details:', err);
        }
    };

    return (
        <div className="space-y-4">
            <LogSettingsPanel />

            <div className="flex flex-wrap items-center justify-between gap-4 py-2">
                <div className="flex items-center gap-4">
                    <h3 className="admin-title text-lg font-semibold">{t('audit.event_feed')}</h3>
                    <div className="admin-surface-muted flex items-center gap-2 rounded-full border px-3 py-1">
                        <div className={cn("w-2 h-2 rounded-full", autoRefresh ? "bg-emerald-500 animate-pulse" : "bg-slate-500")} />
                        <span className="admin-muted text-xs">{t('audit.live')}</span>
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(e) => setAutoRefresh(e.target.checked)}
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
                        options={eventTypes.map(type => ({ value: type, label: type.replace(/_/g, ' ') }))}
                    />

                    <ThemedSelect
                        value={lines.toString()}
                        onValueChange={(v) => setLines(parseInt(v))}
                        options={[
                            { value: '50', label: t('audit.last_n', { count: 50 }) },
                            { value: '100', label: t('audit.last_n', { count: 100 }) },
                            { value: '200', label: t('audit.last_n', { count: 200 }) },
                            { value: '500', label: t('audit.last_n', { count: 500 }) },
                        ]}
                    />

                    <div className="flex gap-2">
                        <button
                            onClick={exportToCSV}
                            className="admin-surface-muted admin-text flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-white/10"
                            title={t('console.export_csv')}
                        >
                            <FileDown className="h-4 w-4" />
                            CSV
                        </button>
                        <button
                            onClick={exportToJSON}
                            className="admin-surface-muted admin-text flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-white/10"
                            title={t('console.export_json')}
                        >
                            <FileDown className="h-4 w-4" />
                            JSON
                        </button>
                    </div>

                    <button
                        onClick={() => refetch()}
                        className="admin-tab-inactive rounded-lg p-2 transition-colors hover:bg-white/5"
                        title={t('console.manual_refresh')}
                    >
                        <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                    </button>
                </div>
            </div>

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
                            logs.map((log, idx) => (
                                <tr key={`${log.timestamp}-${idx}`} className="hover:bg-white/5 transition-colors">
                                    <td className="admin-muted whitespace-nowrap py-3 px-4">
                                        {log.timestamp ? formatDateTimeValue(log.timestamp, i18n.language) : t('common:fallbacks.not_available')}
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className={cn(
                                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                                            log.event?.includes('create') && "bg-emerald-500/20 text-emerald-400",
                                            log.event?.includes('update') && "bg-amber-500/20 text-amber-400",
                                            log.event?.includes('delete') && "bg-red-500/20 text-red-400",
                                            !log.event?.includes('create') && !log.event?.includes('update') && !log.event?.includes('delete') && "bg-blue-500/20 text-blue-400"
                                        )}>
                                            {log.event?.replace(/_/g, ' ') || t('common:fallbacks.unknown')}
                                        </span>
                                    </td>
                                    <td className="admin-title py-3 px-4 font-medium">
                                        {log.user_id ? `USR-${log.user_id}` : t('common:fallbacks.system')}
                                    </td>
                                    <td className="admin-subtle py-3 px-4 font-mono text-xs">
                                        {log.client_ip || t('common:fallbacks.not_available')}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <button
                                            className="text-xs text-accent hover:underline"
                                            onClick={() => setSelectedLogExtra(log.extra || {})}
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

            <AnimatePresence>
                {selectedLogExtra && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
                            onClick={() => setSelectedLogExtra(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            className="relative w-full max-w-2xl max-h-[80vh] glass-card !p-0 overflow-hidden shadow-2xl"
                        >
                            <div className="admin-surface-muted flex items-center justify-between border-b px-5 py-4">
                                <h4 className="admin-title text-sm font-bold">{t('audit.details_modal.title')}</h4>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={copyDetails}
                                        className="admin-surface-muted admin-text flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors hover:bg-white/10"
                                    >
                                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                        {copied ? t('audit.details_modal.copied') : t('audit.details_modal.copy')}
                                    </button>
                                    <button
                                        onClick={() => setSelectedLogExtra(null)}
                                        className="admin-surface-muted admin-text rounded-lg border px-3 py-1.5 text-xs transition-colors hover:bg-white/10"
                                    >
                                        {t('common:actions.close')}
                                    </button>
                                </div>
                            </div>
                            <div className="p-5 max-h-[60vh] overflow-auto">
                                <pre className="admin-text whitespace-pre-wrap break-all rounded-xl border border-white/10 bg-black/20 p-4 text-xs">
                                    {detailsJson}
                                </pre>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
