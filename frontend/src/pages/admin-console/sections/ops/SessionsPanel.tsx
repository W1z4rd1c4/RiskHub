import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useTranslation } from '@/i18n/hooks';
import { adminKeys } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';
import { adminApi, type ActiveSession } from '@/services/adminApi';
import { ApiClientError } from '@/services/apiClient';
import { logError } from '@/services/logger';

import { SessionsTable } from './SessionsTable';

export function SessionsPanel() {
    const { t } = useTranslation('admin');
    const queryClient = useQueryClient();
    const [pendingRevokeSession, setPendingRevokeSession] = useState<ActiveSession | null>(null);
    const [directorySummary, setDirectorySummary] = useState<string | null>(null);
    const [directorySyncing, setDirectorySyncing] = useState(false);
    const [revokeError, setRevokeError] = useState<string | null>(null);

    const { data: sessions, isLoading } = useQuery({
        queryKey: adminKeys.sessions(),
        queryFn: () => adminApi.getActiveSessions(),
    });
    const { data: capabilities } = useQuery({
        queryKey: adminKeys.capabilities(),
        queryFn: () => adminApi.getCapabilities(),
    });
    const canRevokeSessions = capabilities?.can_revoke_sessions === true;
    const canRunDirectoryCheckAll = capabilities?.can_run_directory_check_all === true;

    const revokeMutation = useMutation({
        mutationFn: (userId: number) => adminApi.revokeSession(userId),
        onMutate: () => setRevokeError(null),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.sessions() }),
        onError: (error) => {
            const message = error instanceof ApiClientError
                ? (error.rawMessage ?? error.messageKey)
                : t('sessions.revoke_failed', { defaultValue: 'Failed to revoke session.' });
            setRevokeError(message);
            void queryClient.invalidateQueries({ queryKey: adminKeys.sessions() });
        },
    });

    const handleConfirmRevoke = () => {
        if (!pendingRevokeSession) return;
        revokeMutation.mutate(pendingRevokeSession.user_id, {
            onSettled: () => setPendingRevokeSession(null),
        });
    };

    const handleCheckAllDirectory = async () => {
        try {
            setDirectorySyncing(true);
            const result = await adminApi.checkAllDirectoryUsers();
            setDirectorySummary(
                t('users.directory_check_all_success', {
                    defaultValue: `Checked ${result.checked} users (${result.deprovisioned} deprovisioned).`,
                    checked: result.checked,
                    deprovisioned: result.deprovisioned,
                }),
            );
            void queryClient.invalidateQueries({ queryKey: adminKeys.sessions() });
        } catch (error) {
            logError('Directory check-all failed.', error);
            setDirectorySummary(t('users.directory_check_failed', { defaultValue: 'Directory check failed.' }));
        } finally {
            setDirectorySyncing(false);
        }
    };

    if (isLoading) {
        return <div className="admin-muted text-center py-8">{t('sessions.loading')}</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="admin-title text-lg font-semibold">{t('sessions.title')}</h3>
                <div className="flex items-center gap-3">
                    <p className="admin-subtle text-sm">
                        {t('sessions.description')}
                    </p>
                    {canRunDirectoryCheckAll && (
                        <button
                            onClick={handleCheckAllDirectory}
                            disabled={directorySyncing}
                            className="inline-flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <RefreshCw className={cn('h-3.5 w-3.5', directorySyncing && 'animate-spin')} />
                            {directorySyncing
                                ? t('users.checking_directory', { defaultValue: 'Checking...' })
                                : t('users.check_directory', { defaultValue: 'Check AD' })}
                        </button>
                    )}
                </div>
            </div>

            {directorySummary && (
                <div className="admin-surface-muted admin-text rounded-lg border px-3 py-2 text-xs">
                    {directorySummary}
                </div>
            )}
            {revokeError && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                    {revokeError}
                </div>
            )}

            <SessionsTable
                canRevokeSessions={canRevokeSessions}
                sessions={sessions}
                onRevoke={setPendingRevokeSession}
            />
            <ConfirmDialog
                isOpen={pendingRevokeSession !== null}
                onClose={() => setPendingRevokeSession(null)}
                onConfirm={handleConfirmRevoke}
                title={t('sessions.revoke')}
                message={t('sessions.revoke_confirm', { name: pendingRevokeSession?.user_name ?? '' })}
                confirmLabel={t('sessions.revoke')}
                variant="warning"
                isLoading={revokeMutation.isPending}
            />
        </div>
    );
}
