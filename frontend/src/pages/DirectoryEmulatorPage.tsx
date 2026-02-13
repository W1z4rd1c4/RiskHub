import { useEffect, useState } from 'react';
import {
    Server,
    Search,
    RefreshCw,
    Play,
    AlertTriangle,
    History,
    Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/hooks';
import { directoryApi } from '@/services/directoryApi';
import { usePermissions } from '@/hooks/usePermissions';
import type {
    DirectorySyncPreview,
    DirectorySyncLogRead,
} from '@/types/directory';

export function DirectoryEmulatorPage() {
    const { t } = useTranslation(['common', 'admin', 'errorKeys']);
    const { canManageUsers } = usePermissions();
    const [syncHistory, setSyncHistory] = useState<DirectorySyncLogRead[]>([]);
    const [syncPreview, setSyncPreview] = useState<DirectorySyncPreview | null>(null);

    const [isSyncing, setIsSyncing] = useState(false);
    const [syncErrorKey, setSyncErrorKey] = useState<string | null>(null);

    useEffect(() => {
        fetchSyncHistory();
    }, []);

    const fetchSyncHistory = async () => {
        try {
            const data = await directoryApi.listDirectorySyncHistory();
            setSyncHistory(data);
        } catch (error) {
            console.error('Failed to fetch sync history:', error);
        }
    };

    const runPreviewSync = async () => {
        setSyncErrorKey(null);
        try {
            setIsSyncing(true);
            const preview = await directoryApi.previewDirectorySync();
            setSyncPreview(preview);
        } catch (error) {
            console.error('Failed to preview sync:', error);
            setSyncErrorKey('errorKeys.directory_preview_failed');
        } finally {
            setIsSyncing(false);
        }
    };

    const runApplySync = async () => {
        setSyncErrorKey(null);
        try {
            setIsSyncing(true);
            const result = await directoryApi.applyDirectorySync();
            setSyncPreview(result);
            await fetchSyncHistory();
        } catch (error) {
            console.error('Failed to apply sync:', error);
            setSyncErrorKey('errorKeys.directory_apply_failed');
        } finally {
            setIsSyncing(false);
        }
    };

    if (!canManageUsers) {
        return (
            <div className="glass-card p-8 text-center">
                <AlertTriangle className="mx-auto h-10 w-10 text-rose-400" />
                <h2 className="mt-4 text-xl font-bold text-white">{t('common:access.denied')}</h2>
                <p className="mt-2 text-slate-400">{t('admin:access.directory_sync_denied', 'You do not have permission to manage directory sync.')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                        <Server className="h-8 w-8 text-accent" />
                        {t('admin:directory.title', 'Directory Integration')}
                    </h1>
                    <p className="text-slate-400 mt-1">
                        {t('admin:directory.subtitle', 'Sync users from the external AD Emulator into RiskHub.')}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Sync Controls & Preview */}
                <div className="space-y-6">
                    <div className="glass-card p-6 space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Activity className="h-5 w-5 text-accent" />
                                <h3 className="text-lg font-semibold text-white">{t('admin:directory.sync_operations', 'Sync Operations')}</h3>
                            </div>
                            {isSyncing && <RefreshCw className="h-5 w-5 text-accent animate-spin" />}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={runPreviewSync}
                                disabled={isSyncing}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all disabled:opacity-50 border border-white/10 font-medium"
                            >
                                <Search className="h-4 w-4" />
                                {t('admin:directory.preview_changes', 'Preview Changes')}
                            </button>
                            <button
                                onClick={runApplySync}
                                disabled={isSyncing}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent hover:bg-accent/80 text-white transition-all disabled:opacity-50 font-bold shadow-lg shadow-accent/20"
                            >
                                <Play className="h-4 w-4" />
                                {t('admin:directory.apply_sync', 'Apply Sync')}
                            </button>
                        </div>

                        {syncErrorKey && (
                            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm rounded-xl p-4 flex items-center gap-3">
                                <AlertTriangle className="h-5 w-5 shrink-0" />
                                {t(syncErrorKey, { ns: 'errorKeys' })}
                            </div>
                        )}

                        {syncPreview && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                                <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                                    <h4 className="text-sm font-semibold text-slate-300 mb-3">{t('admin:directory.sync_preview_results', 'Sync Preview Results')}</h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-4">
                                        <div className="bg-emerald-500/10 rounded-lg p-3 border border-emerald-500/20">
                                            <p className="text-emerald-400 font-medium">{t('admin:directory.metrics.created', 'Created')}</p>
                                            <p className="text-xl font-bold text-white mt-1">{syncPreview.created_count}</p>
                                        </div>
                                        <div className="bg-sky-500/10 rounded-lg p-3 border border-sky-500/20">
                                            <p className="text-sky-400 font-medium">{t('admin:directory.metrics.updated', 'Updated')}</p>
                                            <p className="text-xl font-bold text-white mt-1">{syncPreview.updated_count}</p>
                                        </div>
                                        <div className="bg-rose-500/10 rounded-lg p-3 border border-rose-500/20">
                                            <p className="text-rose-400 font-medium">{t('admin:directory.metrics.deactivated', 'Deactivated')}</p>
                                            <p className="text-xl font-bold text-white mt-1">{syncPreview.deactivated_count}</p>
                                        </div>
                                        <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
                                            <p className="text-amber-400 font-medium">{t('common:access.errors')}</p>
                                            <p className="text-xl font-bold text-white mt-1">{syncPreview.error_count}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        {syncPreview.diffs.length > 0 ? (
                                            syncPreview.diffs.map((diff) => (
                                                <div key={`${diff.external_id}-${diff.action}`} className="bg-black/20 rounded-lg p-3 text-xs border border-white/5">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-white font-medium truncate max-w-[200px]" title={diff.email || diff.external_id}>
                                                            {diff.email || diff.user_principal_name || diff.external_id}
                                                        </span>
                                                        <span className={cn(
                                                            "uppercase text-[10px] font-bold px-1.5 py-0.5 rounded",
                                                            diff.action === 'create' && "bg-emerald-500/20 text-emerald-400",
                                                            diff.action === 'update' && "bg-sky-500/20 text-sky-400",
                                                            diff.action === 'deactivate' && "bg-rose-500/20 text-rose-400",
                                                            diff.action === 'error' && "bg-amber-500/20 text-amber-400"
                                                        )}>
                                                            {diff.action}
                                                        </span>
                                                    </div>
                                                    {diff.error && <p className="text-rose-300 mt-1">{diff.error}</p>}
                                                    {diff.changes && (
                                                        <div className="mt-2 space-y-1 pl-2 border-l-2 border-white/10">
                                                            {Object.entries(diff.changes).map(([field, change]) => (
                                                                <div key={field} className="flex items-center justify-between text-[10px] text-slate-400">
                                                                    <span className="uppercase tracking-wider">{field}</span>
                                                                    <span className="text-slate-500 max-w-[150px] truncate">
                                                                        {String(change.old)} <span className="text-slate-600 px-1">→</span> <span className="text-slate-200">{String(change.new)}</span>
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-4 text-slate-500 text-sm">
                                                {t('admin:directory.no_changes', 'No changes detected. Sync is up to date.')}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sync History */}
                <div className="space-y-6">
                    <div className="glass-card p-6 h-full">
                        <div className="flex items-center gap-2 mb-6">
                            <History className="h-5 w-5 text-accent" />
                            <h3 className="text-lg font-semibold text-white">{t('admin:directory.sync_history', 'Sync History')}</h3>
                        </div>
                        <div className="space-y-3">
                            {syncHistory.length === 0 ? (
                                <div className="text-center py-12 text-slate-500 bg-white/5 rounded-xl border border-white/10 border-dashed">
                                    <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <p>{t('common:empty.no_sync_runs')}</p>
                                </div>
                            ) : (
                                syncHistory.map((log) => (
                                    <div key={log.id} className="bg-white/5 hover:bg-white/10 transition-colors rounded-xl p-4 text-sm border border-white/10 group">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className={cn(
                                                    "h-2 w-2 rounded-full",
                                                    log.status === 'success' && "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]",
                                                    log.status === 'partial' && "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]",
                                                    log.status === 'failed' && "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                                                )} />
                                                <span className="text-white font-medium capitalize">{log.status}</span>
                                            </div>
                                            <span className="text-xs text-slate-500 font-mono">
                                                {new Date(log.created_at).toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-4 gap-2 text-xs pt-2 border-t border-white/5">
                                            <div className="text-emerald-400 group-hover:text-emerald-300">
                                                <span className="opacity-70 block text-[10px] uppercase">{t('admin:directory.metrics.created', 'Created')}</span>
                                                <span className="font-bold">{log.created_count}</span>
                                            </div>
                                            <div className="text-sky-400 group-hover:text-sky-300">
                                                <span className="opacity-70 block text-[10px] uppercase">{t('admin:directory.metrics.updated', 'Updated')}</span>
                                                <span className="font-bold">{log.updated_count}</span>
                                            </div>
                                            <div className="text-rose-400 group-hover:text-rose-300">
                                                <span className="opacity-70 block text-[10px] uppercase">{t('admin:directory.metrics.disabled', 'Disabled')}</span>
                                                <span className="font-bold">{log.deactivated_count}</span>
                                            </div>
                                            <div className="text-amber-400 group-hover:text-amber-300">
                                                <span className="opacity-70 block text-[10px] uppercase">{t('common:access.errors')}</span>
                                                <span className="font-bold">{log.error_count}</span>
                                            </div>
                                        </div>
                                        {log.errors && log.errors.length > 0 && (
                                            <div className="mt-3 pt-2 border-t border-white/5 text-xs text-rose-300">
                                                <p className="font-medium mb-1">{t('admin:directory.latest_error', 'Latest Error:')}</p>
                                                <p className="bg-rose-500/10 p-2 rounded truncate">
                                                    {String(log.errors[0]?.error || t('common:labels.unknown'))}
                                                    {log.errors.length > 1 && t('admin:directory.more_errors', { defaultValue: ' (+{{count}} more)', count: log.errors.length - 1 })}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
