import type { ActiveSession } from '@/services/adminApi';

const ONLINE_THRESHOLD_MINUTES = 10;

export type SessionStatusKey = 'sessions.revoked' | 'sessions.online' | 'sessions.offline';

export interface SessionPresentation {
    /** Minutes online (or since the last activity when offline); formatted by the caller with `useFormat`. */
    durationMinutes: number | null;
    isRevoked: boolean;
    lastActivityDate: Date;
    statusColor: string;
    statusKey: SessionStatusKey;
}

export function getSessionPresentation(session: ActiveSession, now: Date): SessionPresentation {
    const lastActivityDate = new Date(session.last_activity);
    const lastLoginDate = session.last_login ? new Date(session.last_login) : null;
    const minutesSinceActivity = Math.floor((now.getTime() - lastActivityDate.getTime()) / 60000);
    const isOnline = session.is_active && minutesSinceActivity < ONLINE_THRESHOLD_MINUTES;
    const isRevoked = !session.is_active;

    if (isRevoked) {
        return {
            durationMinutes: null,
            isRevoked,
            lastActivityDate,
            statusColor: 'bg-destructive',
            statusKey: 'sessions.revoked',
        };
    }

    if (isOnline) {
        const onlineMinutes = lastLoginDate
            ? Math.floor((now.getTime() - lastLoginDate.getTime()) / 60000)
            : null;

        return {
            durationMinutes: onlineMinutes,
            isRevoked,
            lastActivityDate,
            statusColor: 'bg-success',
            statusKey: 'sessions.online',
        };
    }

    return {
        durationMinutes: minutesSinceActivity,
        isRevoked,
        lastActivityDate,
        statusColor: 'bg-muted-foreground',
        statusKey: 'sessions.offline',
    };
}
