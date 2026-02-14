import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/i18n/hooks';
import {
    Server, Users, Activity, Terminal, RefreshCw,
    Database, Clock, MemoryStick,
    UserX, Shield, FileDown, Settings2
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthz } from '@/authz/useAuthz';
import { adminApi, type LogConfig } from '@/services/adminApi';
import { cn } from '@/lib/utils';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

const tabDefs = [
    { id: 'health', labelKey: 'tabs.health', icon: Activity },
    { id: 'logs', labelKey: 'tabs.application_logs', icon: Terminal },
    { id: 'audit', labelKey: 'tabs.audit_logs', icon: Shield },
    { id: 'sessions', labelKey: 'tabs.sessions', icon: Users },
] as const;

type TabId = typeof tabDefs[number]['id'];

function LogSettingsPanel() {
    const { t } = useTranslation('admin');
    const queryClient = useQueryClient();
    const { data: config, isLoading } = useQuery({
        queryKey: ['logConfig'],
        queryFn: () => adminApi.getLogConfig(),
    });

    const mutation = useMutation({
        mutationFn: (newConfig: LogConfig) => adminApi.updateLogConfig(newConfig),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['logConfig'] });
            alert('Log settings updated. Changes require backend restart to take full effect.');
        },
    });

    const [form, setForm] = useState<LogConfig | null>(null);

    // Sync form with data
    if (config && !form && !isLoading) {
        setForm(config);
    }

    if (isLoading || !form) return null;

    return (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-4">
                <Settings2 className="h-5 w-5 text-accent" />
                <h4 className="text-white font-medium">{t('audit.title')}</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    <h5 className="text-sm font-semibold text-white">{t('tabs.application_logs')}</h5>
                    <div className="space-y-2">
                        <label className="text-sm text-slate-400">{t('audit.max_file_size')}</label>
                        <input
                            type="number"
                            value={form.app_log_rotation_size_mb}
                            onChange={(e) => setForm({ ...form, app_log_rotation_size_mb: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-accent"
                            min="1"
                            max="500"
                        />
                        <p className="text-xs text-slate-500">{t('audit.max_file_size_hint')}</p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm text-slate-400">{t('audit.retention_count')}</label>
                        <input
                            type="number"
                            value={form.app_log_retention_count}
                            onChange={(e) => setForm({ ...form, app_log_retention_count: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-accent"
                            min="1"
                            max="500"
                        />
                        <p className="text-xs text-slate-500">{t('audit.retention_count_hint')}</p>
                    </div>
                </div>

                <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    <h5 className="text-sm font-semibold text-white">{t('tabs.audit_logs')}</h5>
                    <div className="space-y-2">
                        <label className="text-sm text-slate-400">{t('audit.max_file_size')}</label>
                        <input
                            type="number"
                            value={form.audit_log_rotation_size_mb}
                            onChange={(e) => setForm({ ...form, audit_log_rotation_size_mb: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-accent"
                            min="1"
                            max="500"
                        />
                        <p className="text-xs text-slate-500">{t('audit.max_file_size_hint')}</p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm text-slate-400">{t('audit.retention_count')}</label>
                        <input
                            type="number"
                            value={form.audit_log_retention_count}
                            onChange={(e) => setForm({ ...form, audit_log_retention_count: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-accent"
                            min="1"
                            max="500"
                        />
                        <p className="text-xs text-slate-500">{t('audit.retention_count_hint')}</p>
                    </div>
                </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-amber-500/80 italic">
                    {t('audit.note')}
                </p>
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

function AuditLogsPanel() {
    const { t } = useTranslation('admin');
    const [lines, setLines] = useState<number>(100);
    const [eventFilter, setEventFilter] = useState<string>('');
    const [autoRefresh, setAutoRefresh] = useState(false);

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['adminAuditLogs', lines, eventFilter],
        queryFn: () => adminApi.getAuditLogs({ lines, event_type: eventFilter || undefined }),
        refetchInterval: autoRefresh ? 5000 : false,
    });

    const exportToCSV = () => {
        if (!data?.entries.length) return;
        const headers = ["Timestamp", "Level", "Event", "User ID", "IP", "Request ID", "Details"];
        const rows = data.entries.map(e => [
            e.timestamp,
            e.level,
            e.event,
            e.user_id,
            e.client_ip,
            e.request_id,
            JSON.stringify(e.extra).replace(/"/g, '""')
        ]);

        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
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
        return <div className="text-slate-400 text-center py-8">{t('application_logs.loading')}</div>;
    }

    const logs = data?.entries || [];
    const eventTypes = [...new Set(logs.map(l => l.event || ''))].filter(Boolean);

    return (
        <div className="space-y-4">
            <LogSettingsPanel />

            <div className="flex flex-wrap items-center justify-between gap-4 py-2">
                <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold text-white">{t('audit.event_feed')}</h3>
                    <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
                        <div className={cn("w-2 h-2 rounded-full", autoRefresh ? "bg-emerald-500 animate-pulse" : "bg-slate-500")} />
                        <span className="text-xs text-slate-400">{t('audit.live')}</span>
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
                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg transition-colors border border-white/10"
                            title={t('console.export_csv')}
                        >
                            <FileDown className="h-4 w-4" />
                            CSV
                        </button>
                        <button
                            onClick={exportToJSON}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg transition-colors border border-white/10"
                            title={t('console.export_json')}
                        >
                            <FileDown className="h-4 w-4" />
                            JSON
                        </button>
                    </div>

                    <button
                        onClick={() => refetch()}
                        className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                        title={t('console.manual_refresh')}
                    >
                        <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto border border-white/10 rounded-xl">
                <table className="w-full text-sm text-left">
                    <thead className="bg-white/5 text-slate-400">
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
                                <td colSpan={5} className="py-8 text-center text-slate-500">
                                    {t('audit.no_events')}
                                </td>
                            </tr>
                        ) : (
                            logs.map((log, idx) => (
                                <tr key={`${log.timestamp}-${idx}`} className="hover:bg-white/5 transition-colors">
                                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                                        {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className={cn(
                                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                                            log.event?.includes('create') && "bg-emerald-500/20 text-emerald-400",
                                            log.event?.includes('update') && "bg-amber-500/20 text-amber-400",
                                            log.event?.includes('delete') && "bg-red-500/20 text-red-400",
                                            !log.event?.includes('create') && !log.event?.includes('update') && !log.event?.includes('delete') && "bg-blue-500/20 text-blue-400"
                                        )}>
                                            {log.event?.replace(/_/g, ' ') || 'UNKNOWN'}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-white font-medium">
                                        USR-{log.user_id || 'SYS'}
                                    </td>
                                    <td className="py-3 px-4 text-slate-500 font-mono text-xs">
                                        {log.client_ip || '—'}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <button
                                            className="text-xs text-accent hover:underline"
                                            onClick={() => alert(JSON.stringify(log.extra, null, 2))}
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
        </div>
    );
}

function HealthPanel() {
    const { t } = useTranslation('admin');
    const { data: health, isLoading, refetch } = useQuery({
        queryKey: ['adminHealth'],
        queryFn: () => adminApi.getSystemHealth(),
        refetchInterval: 30000, // Refresh every 30 seconds
    });

    const { data: stats } = useQuery({
        queryKey: ['adminStats'],
        queryFn: () => adminApi.getSystemStats(),
    });

    if (isLoading) {
        return <div className="text-slate-400 text-center py-8">{t('health.loading')}</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">{t('health.title')}</h3>
                <button
                    onClick={() => refetch()}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                    <RefreshCw className="h-4 w-4" />
                    {t('health.refresh')}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white/5 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <Database className={cn(
                            "h-5 w-5",
                            health?.database_status === 'connected' ? 'text-green-400' : 'text-red-400'
                        )} />
                        <span className="text-slate-400 text-sm">{t('health.database')}</span>
                    </div>
                    <p className={cn(
                        "text-xl font-bold",
                        health?.database_status === 'connected' ? 'text-green-400' : 'text-red-400'
                    )}>
                        {health?.database_status === 'connected' ? t('health.connected') : t('health.error')}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                        {t('health.latency')}: {health?.database_latency_ms?.toFixed(2)}ms
                    </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <Clock className="h-5 w-5 text-blue-400" />
                        <span className="text-slate-400 text-sm">{t('health.uptime')}</span>
                    </div>
                    <p className="text-xl font-bold text-white">
                        {Math.floor((health?.uptime_seconds || 0) / 3600)}h {Math.floor(((health?.uptime_seconds || 0) % 3600) / 60)}m
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                        {t('health.since_restart')}
                    </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <MemoryStick className="h-5 w-5 text-purple-400" />
                        <span className="text-slate-400 text-sm">{t('health.memory')}</span>
                    </div>
                    <p className="text-xl font-bold text-white">
                        {health?.memory_usage_mb?.toFixed(0)} MB
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                        {t('health.process_memory')}
                    </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <Users className="h-5 w-5 text-amber-400" />
                        <span className="text-slate-400 text-sm">{t('health.active_users')}</span>
                    </div>
                    <p className="text-xl font-bold text-white">
                        {stats?.active_users_24h || 0}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                        {t('health.in_last_24h')}
                    </p>
                </div>
            </div>
        </div>
    );
}

function LogsPanel() {
    const { t } = useTranslation('admin');
    const [eventFilter, setEventFilter] = useState<string>('');

    const { data: logs, isLoading } = useQuery({
        queryKey: ['adminLogs', eventFilter],
        queryFn: () => adminApi.getTechnicalLogs({ event_type: eventFilter || undefined, limit: 100 }),
    });

    if (isLoading) {
        return <div className="text-slate-400 text-center py-8">{t('application_logs.loading')}</div>;
    }

    const eventTypes = [...new Set(logs?.map(l => l.event_type) || [])];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">{t('application_logs.title')}</h3>
                <ThemedSelect
                    value={eventFilter}
                    onValueChange={setEventFilter}
                    placeholder={t('application_logs.all_events')}
                    allowEmpty
                    emptyLabel={t('application_logs.all_events')}
                    options={eventTypes.map(type => ({ value: type, label: type }))}
                />
            </div>

            <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-900">
                        <tr className="border-b border-white/10">
                            <th className="text-left py-2 px-3 text-slate-400 font-medium">{t('application_logs.columns.time')}</th>
                            <th className="text-left py-2 px-3 text-slate-400 font-medium">{t('application_logs.columns.level')}</th>
                            <th className="text-left py-2 px-3 text-slate-400 font-medium">{t('application_logs.columns.event')}</th>
                            <th className="text-left py-2 px-3 text-slate-400 font-medium">{t('application_logs.columns.user')}</th>
                            <th className="text-left py-2 px-3 text-slate-400 font-medium">{t('application_logs.columns.details')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs?.map((log) => (
                            <tr key={log.id} className="border-b border-white/5 hover:bg-white/5">
                                <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                                    {new Date(log.timestamp).toLocaleString()}
                                </td>
                                <td className="py-2 px-3">
                                    <span className={cn(
                                        "px-2 py-0.5 rounded text-xs font-medium",
                                        log.level === 'INFO' && "bg-blue-500/20 text-blue-400",
                                        log.level === 'WARNING' && "bg-amber-500/20 text-amber-400",
                                        log.level === 'ERROR' && "bg-red-500/20 text-red-400"
                                    )}>
                                        {log.level}
                                    </span>
                                </td>
                                <td className="py-2 px-3 text-white">{log.event_type}</td>
                                <td className="py-2 px-3 text-slate-400">{log.user_name || '—'}</td>
                                <td className="py-2 px-3 text-slate-500 max-w-xs truncate" title={log.details || ''}>
                                    {log.details || '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function SessionsPanel() {
    const { t } = useTranslation('admin');
    const queryClient = useQueryClient();

    const { data: sessions, isLoading } = useQuery({
        queryKey: ['adminSessions'],
        queryFn: () => adminApi.getActiveSessions(),
    });

    const revokeMutation = useMutation({
        mutationFn: (userId: number) => adminApi.revokeSession(userId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminSessions'] }),
    });

    if (isLoading) {
        return <div className="text-slate-400 text-center py-8">{t('sessions.loading')}</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">{t('sessions.title')}</h3>
                <p className="text-sm text-slate-500">
                    {t('sessions.description')}
                </p>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('sessions.columns.user')}</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('sessions.columns.email')}</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('sessions.columns.role')}</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('sessions.columns.department')}</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('sessions.columns.last_activity')}</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('sessions.columns.status')}</th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">{t('sessions.columns.actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sessions?.map((session) => {
                            // Calculate status and duration
                            const lastActivityDate = new Date(session.last_activity);
                            const lastLoginDate = session.last_login ? new Date(session.last_login) : null;
                            const now = new Date();

                            // Online threshold: 10 minutes
                            const minutesSinceActivity = Math.floor((now.getTime() - lastActivityDate.getTime()) / 60000);
                            const isOnline = session.is_active && minutesSinceActivity < 10;
                            const isRevoked = !session.is_active;

                            let statusColor = "bg-slate-500";
                            let statusText = t('sessions.offline');
                            let durationText = "";

                            if (isRevoked) {
                                statusColor = "bg-red-500";
                                statusText = t('sessions.revoked');
                            } else if (isOnline) {
                                statusColor = "bg-emerald-500";
                                statusText = t('sessions.online');
                                if (lastLoginDate) {
                                    const onlineMinutes = Math.floor((now.getTime() - lastLoginDate.getTime()) / 60000);
                                    const hours = Math.floor(onlineMinutes / 60);
                                    const mins = onlineMinutes % 60;
                                    durationText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                                }
                            } else {
                                // Offline
                                const hours = Math.floor(minutesSinceActivity / 60);
                                const mins = minutesSinceActivity % 60;
                                durationText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                            }

                            return (
                                <tr key={session.user_id} className="border-b border-white/5 hover:bg-white/5">
                                    <td className="py-3 px-4 text-white font-medium">{session.user_name}</td>
                                    <td className="py-3 px-4 text-slate-400">{session.user_email}</td>
                                    <td className="py-3 px-4">
                                        <span className="px-2 py-0.5 bg-white/10 text-slate-300 text-xs rounded-full">
                                            {session.role}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-slate-400">{session.department || '—'}</td>
                                    <td className="py-3 px-4 text-slate-500">
                                        {lastActivityDate.toLocaleString()}
                                    </td>
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-2">
                                            <div className={cn("w-2 h-2 rounded-full", statusColor)} />
                                            <div className="flex flex-col">
                                                <span className="text-white text-sm font-medium">{statusText}</span>
                                                {durationText && (
                                                    <span className="text-xs text-slate-500">{durationText}</span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        {!isRevoked && (
                                            <button
                                                onClick={() => {
                                                    if (confirm(t('sessions.revoke_confirm', { name: session.user_name }))) {
                                                        revokeMutation.mutate(session.user_id);
                                                    }
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-400 hover:text-white hover:bg-red-500/20 rounded-lg transition-colors ml-auto"
                                            >
                                                <UserX className="h-4 w-4" />
                                                {t('sessions.revoke')}
                                            </button>
                                        )}
                                        {isRevoked && (
                                            <span className="text-xs text-red-500 font-medium px-3 py-1.5">{t('sessions.access_revoked')}</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function AdminConsolePage() {
    const { t } = useTranslation('admin');
    const { isLoading } = useAuth();
    const authz = useAuthz();
    const [activeTab, setActiveTab] = useState<TabId>('health');

    // Wait for auth to load before checking role
    if (isLoading) {
        return <div className="flex items-center justify-center min-h-screen text-slate-400">{t('console.loading')}</div>;
    }

    // Only Admin can access Admin Console
    if (!authz.canViewAdminConsole) {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <header className="glass-card p-6">
                <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-slate-600 to-slate-800 p-3 rounded-xl shadow-lg">
                        <Server className="h-8 w-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white font-heading">{t('console.title')}</h1>
                        <p className="text-slate-400">
                            {t('console.subtitle')}
                        </p>
                    </div>
                </div>
            </header>

            {/* Tab Navigation */}
            <div className="glass-card p-2 flex gap-2 overflow-x-auto">
                {tabDefs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap",
                                isActive
                                    ? "bg-slate-600 text-white shadow-lg"
                                    : "text-slate-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <tab.icon className="h-4 w-4" />
                            <span className="font-medium">{t(tab.labelKey)}</span>
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <div className="glass-card p-6">
                {activeTab === 'health' && <HealthPanel />}
                {activeTab === 'logs' && <LogsPanel />}
                {activeTab === 'audit' && <AuditLogsPanel />}
                {activeTab === 'sessions' && <SessionsPanel />}
            </div>

        </div>
    );
}
