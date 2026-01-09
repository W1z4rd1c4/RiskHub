import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Server, Users, Activity, Terminal, RefreshCw,
    Database, Clock, MemoryStick,
    UserX, Shield, FileDown, Settings2
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { adminApi, type LogConfig } from '@/services/adminApi';
import { cn } from '@/lib/utils';

const tabs = [
    { id: 'health', label: 'System Health', icon: Activity },
    { id: 'logs', label: 'Application Logs', icon: Terminal },
    { id: 'audit', label: 'Audit Logs', icon: Shield },
    { id: 'sessions', label: 'Active Sessions', icon: Users },
] as const;

type TabId = typeof tabs[number]['id'];

function LogSettingsPanel() {
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
                <h4 className="text-white font-medium">Log Rotation Settings</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-sm text-slate-400">Max File Size (MB)</label>
                    <input
                        type="number"
                        value={form.log_rotation_size_mb}
                        onChange={(e) => setForm({ ...form, log_rotation_size_mb: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-accent"
                        min="1"
                        max="1000"
                    />
                    <p className="text-xs text-slate-500">Maximum size per log file before rotation.</p>
                </div>

                <div className="space-y-2">
                    <label className="text-sm text-slate-400">Retention Count (Files)</label>
                    <input
                        type="number"
                        value={form.log_retention_count}
                        onChange={(e) => setForm({ ...form, log_retention_count: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-accent"
                        min="1"
                        max="50"
                    />
                    <p className="text-xs text-slate-500">Number of backup files to keep.</p>
                </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-amber-500/80 italic">
                    Note: Updating these settings affects both Application and Audit logs.
                </p>
                <button
                    onClick={() => mutation.mutate(form)}
                    disabled={mutation.isPending}
                    className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
                >
                    {mutation.isPending ? 'Saving...' : 'Save Settings'}
                </button>
            </div>
        </div>
    );
}

function AuditLogsPanel() {
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
        return <div className="text-slate-400 text-center py-8">Loading audit logs...</div>;
    }

    const logs = data?.entries || [];
    const eventTypes = [...new Set(logs.map(l => l.event || ''))].filter(Boolean);

    return (
        <div className="space-y-4">
            <LogSettingsPanel />

            <div className="flex flex-wrap items-center justify-between gap-4 py-2">
                <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold text-white">Audit Event Feed</h3>
                    <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
                        <div className={cn("w-2 h-2 rounded-full", autoRefresh ? "bg-emerald-500 animate-pulse" : "bg-slate-500")} />
                        <span className="text-xs text-slate-400">Live</span>
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(e) => setAutoRefresh(e.target.checked)}
                            className="form-checkbox h-3 w-3 text-accent rounded bg-slate-800 border-white/10"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <select
                        value={eventFilter}
                        onChange={(e) => setEventFilter(e.target.value)}
                        className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none"
                    >
                        <option value="">All Events</option>
                        {eventTypes.map(type => (
                            <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
                        ))}
                    </select>

                    <select
                        value={lines}
                        onChange={(e) => setLines(parseInt(e.target.value))}
                        className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none"
                    >
                        <option value="50">Last 50</option>
                        <option value="100">Last 100</option>
                        <option value="200">Last 200</option>
                        <option value="500">Last 500</option>
                    </select>

                    <div className="flex gap-2">
                        <button
                            onClick={exportToCSV}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg transition-colors border border-white/10"
                            title="Export to CSV"
                        >
                            <FileDown className="h-4 w-4" />
                            CSV
                        </button>
                        <button
                            onClick={exportToJSON}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg transition-colors border border-white/10"
                            title="Export to JSON"
                        >
                            <FileDown className="h-4 w-4" />
                            JSON
                        </button>
                    </div>

                    <button
                        onClick={() => refetch()}
                        className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                        title="Manual Refresh"
                    >
                        <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto border border-white/10 rounded-xl">
                <table className="w-full text-sm text-left">
                    <thead className="bg-white/5 text-slate-400">
                        <tr className="border-b border-white/10">
                            <th className="py-3 px-4 font-medium">Timestamp</th>
                            <th className="py-3 px-4 font-medium">Event</th>
                            <th className="py-3 px-4 font-medium">User</th>
                            <th className="py-3 px-4 font-medium">Client IP</th>
                            <th className="py-3 px-4 font-medium text-right">Details</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {logs.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="py-8 text-center text-slate-500">
                                    No audit events found in current log window.
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
                                            View
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
        return <div className="text-slate-400 text-center py-8">Loading system health...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">System Health</h3>
                <button
                    onClick={() => refetch()}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white/5 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <Database className={cn(
                            "h-5 w-5",
                            health?.database_status === 'connected' ? 'text-green-400' : 'text-red-400'
                        )} />
                        <span className="text-slate-400 text-sm">Database</span>
                    </div>
                    <p className={cn(
                        "text-xl font-bold",
                        health?.database_status === 'connected' ? 'text-green-400' : 'text-red-400'
                    )}>
                        {health?.database_status === 'connected' ? 'Connected' : 'Error'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                        Latency: {health?.database_latency_ms?.toFixed(2)}ms
                    </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <Clock className="h-5 w-5 text-blue-400" />
                        <span className="text-slate-400 text-sm">Uptime</span>
                    </div>
                    <p className="text-xl font-bold text-white">
                        {Math.floor((health?.uptime_seconds || 0) / 3600)}h {Math.floor(((health?.uptime_seconds || 0) % 3600) / 60)}m
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                        Since last restart
                    </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <MemoryStick className="h-5 w-5 text-purple-400" />
                        <span className="text-slate-400 text-sm">Memory</span>
                    </div>
                    <p className="text-xl font-bold text-white">
                        {health?.memory_usage_mb?.toFixed(0)} MB
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                        Process memory usage
                    </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <Users className="h-5 w-5 text-amber-400" />
                        <span className="text-slate-400 text-sm">Active Users</span>
                    </div>
                    <p className="text-xl font-bold text-white">
                        {stats?.active_users_24h || 0}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                        In last 24 hours
                    </p>
                </div>
            </div>

            {stats && (
                <div className="bg-white/5 rounded-xl p-4">
                    <h4 className="text-white font-medium mb-4">Platform Statistics</h4>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div>
                            <p className="text-2xl font-bold text-white">{stats.total_users}</p>
                            <p className="text-sm text-slate-500">Total Users</p>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-white">{stats.total_risks}</p>
                            <p className="text-sm text-slate-500">Risks</p>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-white">{stats.total_controls}</p>
                            <p className="text-sm text-slate-500">Controls</p>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-white">{stats.total_kris}</p>
                            <p className="text-sm text-slate-500">KRIs</p>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-amber-400">{stats.pending_approvals}</p>
                            <p className="text-sm text-slate-500">Pending Approvals</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function LogsPanel() {
    const [eventFilter, setEventFilter] = useState<string>('');

    const { data: logs, isLoading } = useQuery({
        queryKey: ['adminLogs', eventFilter],
        queryFn: () => adminApi.getTechnicalLogs({ event_type: eventFilter || undefined, limit: 100 }),
    });

    if (isLoading) {
        return <div className="text-slate-400 text-center py-8">Loading logs...</div>;
    }

    const eventTypes = [...new Set(logs?.map(l => l.event_type) || [])];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Application Logs</h3>
                <select
                    value={eventFilter}
                    onChange={(e) => setEventFilter(e.target.value)}
                    className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                >
                    <option value="">All Events</option>
                    {eventTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                    ))}
                </select>
            </div>

            <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-900">
                        <tr className="border-b border-white/10">
                            <th className="text-left py-2 px-3 text-slate-400 font-medium">Time</th>
                            <th className="text-left py-2 px-3 text-slate-400 font-medium">Level</th>
                            <th className="text-left py-2 px-3 text-slate-400 font-medium">Event</th>
                            <th className="text-left py-2 px-3 text-slate-400 font-medium">User</th>
                            <th className="text-left py-2 px-3 text-slate-400 font-medium">Details</th>
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
        return <div className="text-slate-400 text-center py-8">Loading sessions...</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Active Sessions</h3>
                <p className="text-sm text-slate-500">
                    Users with activity in the last 24 hours
                </p>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">User</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Email</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Role</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Department</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Last Activity</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Status</th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Actions</th>
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
                            let statusText = "Offline";
                            let durationText = "";

                            if (isRevoked) {
                                statusColor = "bg-red-500";
                                statusText = "Revoked";
                            } else if (isOnline) {
                                statusColor = "bg-emerald-500";
                                statusText = "Online";
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
                                                    if (confirm(`Revoke session for ${session.user_name}?`)) {
                                                        revokeMutation.mutate(session.user_id);
                                                    }
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-400 hover:text-white hover:bg-red-500/20 rounded-lg transition-colors ml-auto"
                                            >
                                                <UserX className="h-4 w-4" />
                                                Revoke
                                            </button>
                                        )}
                                        {isRevoked && (
                                            <span className="text-xs text-red-500 font-medium px-3 py-1.5">Access Revoked</span>
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
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<TabId>('health');

    // Only Admin can access Admin Console
    if (user?.role !== 'admin') {
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
                        <h1 className="text-2xl font-bold text-white font-heading">Admin Console</h1>
                        <p className="text-slate-400">
                            Platform administration, system health, and user management
                        </p>
                    </div>
                </div>
            </header>

            {/* Tab Navigation */}
            <div className="glass-card p-2 flex gap-2 overflow-x-auto">
                {tabs.map((tab) => {
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
                            <span className="font-medium">{tab.label}</span>
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
