import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { InlineMessage } from '@/components/ui/inline-message';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { translateUiMessage, useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { adminKeys } from '@/lib/queryKeys';
import { adminApi, type ActiveSession } from '@/services/adminApi';
import { ApiClientError } from '@/services/apiClient';
import { logError } from '@/services/logger';

import { SessionsTable } from './SessionsTable';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';

type DirectoryOutcome = {
    kind: 'status' | 'alert';
    message: string;
};

export function SessionsPanel() {
    const { t } = useTranslation('admin');
    const queryClient = useQueryClient();
    const [pendingRevokeSession, setPendingRevokeSession] = useState<ActiveSession | null>(null);
    const [directoryOutcome, setDirectoryOutcome] = useState<DirectoryOutcome | null>(null);
    const [directorySyncing, setDirectorySyncing] = useState(false);
    const [revokeError, setRevokeError] = useState<string | null>(null);

    const {
        data: sessions,
        isLoading,
        isError: isSessionsError,
        isFetching: isSessionsFetching,
        refetch: refetchSessions,
    } = useQuery({
        queryKey: adminKeys.sessions(),
        queryFn: () => adminApi.getActiveSessions(),
    });
    const { data: capabilities } = useQuery({
        queryKey: adminKeys.capabilities(),
        queryFn: () => adminApi.getCapabilities(),
    });
    const canRevokeSessions = resolveCapabilityFlag(capabilities, 'can_revoke_sessions');
    const canRunDirectoryCheckAll = resolveCapabilityFlag(capabilities, 'can_run_directory_check_all');

    const revokeMutation = useMutation({
        mutationFn: (userId: number) => adminApi.revokeSession(userId),
        onMutate: () => setRevokeError(null),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.sessions() }),
        onError: (error) => {
            setRevokeError(
                error instanceof ApiClientError
                    ? translateUiMessage(t, error.messageKey)
                    : t('sessions.revoke_failed'),
            );
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
        if (directorySyncing) return;
        try {
            setDirectoryOutcome(null);
            setDirectorySyncing(true);
            const result = await adminApi.checkAllDirectoryUsers();
            setDirectoryOutcome({
                kind: 'status',
                message: t('users.directory_check_all_success', {
                    checked: result.checked,
                    deprovisioned: result.deprovisioned,
                }),
            });
            void queryClient.invalidateQueries({ queryKey: adminKeys.sessions() });
        } catch (error) {
            logError('Directory check-all failed.', error);
            setDirectoryOutcome({
                kind: 'alert',
                message: `${t('users.directory_check_failed')} ${t('users.directory_retry_help')}`,
            });
        } finally {
            setDirectorySyncing(false);
        }
    };

    if (isLoading) {
        return <LoadingState label={t('sessions.loading')} />;
    }

    if (isSessionsError && !sessions) {
        return (
            <ErrorState
                title={t('sessions.title')}
                onRetry={() => void refetchSessions()}
                isRetrying={isSessionsFetching}
            />
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">{t('sessions.title')}</h2>
                <div className="flex items-center gap-3">
                    <p className="text-sm text-muted-foreground">
                        {t('sessions.description')}
                    </p>
                    {canRunDirectoryCheckAll && (
                        <RefreshButton
                            onRefresh={() => void handleCheckAllDirectory()}
                            isFetching={directorySyncing}
                            label={directorySyncing
                                ? t('users.checking_directory')
                                : t('users.check_directory')}
                            className="text-xs"
                        />
                    )}
                </div>
            </div>

            {directoryOutcome && (
                <InlineMessage tone={directoryOutcome.kind === 'alert' ? 'danger' : 'success'}>
                    {directoryOutcome.message}
                </InlineMessage>
            )}
            {revokeError && <InlineMessage tone="danger">{revokeError}</InlineMessage>}

            {isSessionsError ? (
                <ErrorState
                    variant="banner"
                    onRetry={() => void refetchSessions()}
                    isRetrying={isSessionsFetching}
                />
            ) : null}
            {sessions && sessions.length === 0 ? (
                <EmptyState title={t('common:empty.no_data')} />
            ) : (
                <SessionsTable
                    canRevokeSessions={canRevokeSessions}
                    sessions={sessions}
                    onRevoke={setPendingRevokeSession}
                />
            )}
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
