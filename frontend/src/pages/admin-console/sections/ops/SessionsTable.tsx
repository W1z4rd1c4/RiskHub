import { UserX } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import type { ActiveSession } from '@/services/adminApi';

import { getSessionPresentation } from './sessionPresentation';

interface SessionsTableProps {
    canRevokeSessions: boolean;
    onRevoke: (session: ActiveSession) => void;
    sessions: ActiveSession[] | undefined;
}

export function SessionsTable({ canRevokeSessions, onRevoke, sessions }: SessionsTableProps) {
    const { t } = useTranslation('admin');
    const format = useFormat();
    const now = new Date();
    // Durations are locale-aware units ("1h 5m" / "1 h 5 min"), not hard-coded suffixes.
    const formatMinutes = (totalMinutes: number) => {
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const minutesText = format.number(minutes, { style: 'unit', unit: 'minute', unitDisplay: 'narrow' });
        return hours > 0
            ? `${format.number(hours, { style: 'unit', unit: 'hour', unitDisplay: 'narrow' })} ${minutesText}`
            : minutesText;
    };

    return (
        <Table density="compact" regionLabel={t('sessions.title')} className="text-left">
            <THead>
                <TR>
                    <TH>{t('sessions.columns.user')}</TH>
                    <TH>{t('sessions.columns.email')}</TH>
                    <TH>{t('sessions.columns.role')}</TH>
                    <TH>{t('sessions.columns.department')}</TH>
                    <TH>{t('sessions.columns.last_activity')}</TH>
                    <TH>{t('sessions.columns.status')}</TH>
                    <TH align="right">{t('sessions.columns.actions')}</TH>
                </TR>
            </THead>
            <TBody>
                {sessions?.map((session) => {
                    const presentation = getSessionPresentation(session, now);

                    return (
                        <TR key={session.user_id}>
                            <TD className="font-medium text-foreground">{session.user_name}</TD>
                            <TD className="text-muted-foreground">{session.user_email}</TD>
                            <TD>
                                <Badge tone="neutral">{session.role}</Badge>
                            </TD>
                            <TD className="text-muted-foreground">{session.department || t('common:fallbacks.not_available')}</TD>
                            <TD className="text-muted-foreground">
                                {format.dateTime(presentation.lastActivityDate)}
                            </TD>
                            <TD>
                                <div className="flex items-center gap-2">
                                    <div aria-hidden="true" className={cn('w-2 h-2 rounded-full', presentation.statusColor)} />
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-foreground">{t(presentation.statusKey)}</span>
                                        {presentation.durationMinutes != null && (
                                            <span className="text-xs text-muted-foreground">{formatMinutes(presentation.durationMinutes)}</span>
                                        )}
                                        <span className="text-xs text-muted-foreground">
                                            {t('sessions.devices_count', { count: session.active_sessions })}
                                        </span>
                                    </div>
                                </div>
                            </TD>
                            <TD align="right">
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
                                    <Badge tone="danger">{t('sessions.access_revoked')}</Badge>
                                )}
                            </TD>
                        </TR>
                    );
                })}
            </TBody>
        </Table>
    );
}
