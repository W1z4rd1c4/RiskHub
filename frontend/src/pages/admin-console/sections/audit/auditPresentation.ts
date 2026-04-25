import type { RecentLogEntry } from '@/services/adminApi';

export function getAuditEventTypes(entries: RecentLogEntry[]): string[] {
    return [...new Set(entries.map((entry) => entry.event || ''))].filter(Boolean);
}

export function getAuditEventClassName(event: string | null): string {
    if (event?.includes('create')) return 'bg-emerald-500/20 text-emerald-400';
    if (event?.includes('update')) return 'bg-amber-500/20 text-amber-400';
    if (event?.includes('delete')) return 'bg-red-500/20 text-red-400';
    return 'bg-blue-500/20 text-blue-400';
}

export function formatAuditEvent(event: string | null, fallback: string): string {
    return event?.replace(/_/g, ' ') || fallback;
}

export function formatAuditUser(userId: number | null, systemLabel: string): string {
    return userId ? `USR-${userId}` : systemLabel;
}
