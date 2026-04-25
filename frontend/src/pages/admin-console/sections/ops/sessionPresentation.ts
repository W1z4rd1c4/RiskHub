import type { ActiveSession } from '@/services/adminApi';

const ONLINE_THRESHOLD_MINUTES = 10;

export type SessionStatusKey = 'sessions.revoked' | 'sessions.online' | 'sessions.offline';

export interface SessionPresentation {
    durationText: string;
    isRevoked: boolean;
    lastActivityDate: Date;
    statusColor: string;
    statusKey: SessionStatusKey;
}

function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export function getSessionPresentation(session: ActiveSession, now: Date): SessionPresentation {
    const lastActivityDate = new Date(session.last_activity);
    const lastLoginDate = session.last_login ? new Date(session.last_login) : null;
    const minutesSinceActivity = Math.floor((now.getTime() - lastActivityDate.getTime()) / 60000);
    const isOnline = session.is_active && minutesSinceActivity < ONLINE_THRESHOLD_MINUTES;
    const isRevoked = !session.is_active;

    if (isRevoked) {
        return {
            durationText: '',
            isRevoked,
            lastActivityDate,
            statusColor: 'bg-red-500',
            statusKey: 'sessions.revoked',
        };
    }

    if (isOnline) {
        const onlineMinutes = lastLoginDate
            ? Math.floor((now.getTime() - lastLoginDate.getTime()) / 60000)
            : null;

        return {
            durationText: onlineMinutes != null ? formatDuration(onlineMinutes) : '',
            isRevoked,
            lastActivityDate,
            statusColor: 'bg-emerald-500',
            statusKey: 'sessions.online',
        };
    }

    return {
        durationText: formatDuration(minutesSinceActivity),
        isRevoked,
        lastActivityDate,
        statusColor: 'bg-slate-500',
        statusKey: 'sessions.offline',
    };
}
