import { UserX } from 'lucide-react';

import { formatDateTimeValue } from '@/i18n/formatters';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import type { ActiveSession } from '@/services/adminApi';

import { getSessionPresentation } from './sessionPresentation';

interface SessionsTableProps {
    canRevokeSessions: boolean;
    onRevoke: (session: ActiveSession) => void;
    sessions: ActiveSession[] | undefined;
}

export function SessionsTable({ canRevokeSessions, onRevoke, sessions }: SessionsTableProps) {
    const { t, i18n } = useTranslation('admin');
    const now = new Date();

    return (
        <div className="overflow-x-auto">
            <table className="w-full">
                <thead>
                    <tr className="border-b border-white/10">
                        <th className="admin-muted text-left py-3 px-4 text-sm font-medium">{t('sessions.columns.user')}</th>
                        <th className="admin-muted text-left py-3 px-4 text-sm font-medium">{t('sessions.columns.email')}</th>
                        <th className="admin-muted text-left py-3 px-4 text-sm font-medium">{t('sessions.columns.role')}</th>
                        <th className="admin-muted text-left py-3 px-4 text-sm font-medium">{t('sessions.columns.department')}</th>
                        <th className="admin-muted text-left py-3 px-4 text-sm font-medium">{t('sessions.columns.last_activity')}</th>
                        <th className="admin-muted text-left py-3 px-4 text-sm font-medium">{t('sessions.columns.status')}</th>
                        <th className="admin-muted text-right py-3 px-4 text-sm font-medium">{t('sessions.columns.actions')}</th>
                    </tr>
                </thead>
                <tbody>
                    {sessions?.map((session) => {
                        const presentation = getSessionPresentation(session, now);

                        return (
                            <tr key={session.user_id} className="border-b border-white/5 hover:bg-white/5">
                                <td className="admin-title py-3 px-4 font-medium">{session.user_name}</td>
                                <td className="admin-muted py-3 px-4">{session.user_email}</td>
                                <td className="py-3 px-4">
                                    <span className="admin-surface-muted admin-text rounded-full px-2 py-0.5 text-xs">
                                        {session.role}
                                    </span>
                                </td>
                                <td className="admin-muted py-3 px-4">{session.department || t('common:fallbacks.not_available')}</td>
                                <td className="admin-subtle py-3 px-4">
                                    {formatDateTimeValue(presentation.lastActivityDate, i18n.language)}
                                </td>
                                <td className="py-3 px-4">
                                    <div className="flex items-center gap-2">
                                        <div className={cn('w-2 h-2 rounded-full', presentation.statusColor)} />
                                        <div className="flex flex-col">
                                            <span className="admin-title text-sm font-medium">{t(presentation.statusKey)}</span>
                                            {presentation.durationText && (
                                                <span className="admin-subtle text-xs">{presentation.durationText}</span>
                                            )}
                                            <span className="admin-subtle text-xs">
                                                {session.active_sessions} {t('sessions.devices')}
                                            </span>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-right">
                                    {canRevokeSessions && !presentation.isRevoked && (
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            size="compact"
                                            onClick={() => onRevoke(session)}
                                            className="ml-auto"
                                        >
                                            <UserX className="h-4 w-4" aria-hidden="true" />
                                            {t('sessions.revoke')}
                                        </Button>
                                    )}
                                    {presentation.isRevoked && (
                                        <span className="text-xs text-red-500 font-medium px-3 py-1.5">{t('sessions.access_revoked')}</span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
