import type { RecentLogEntry } from '@/services/adminApi';

export function getAuditEventTypes(entries: RecentLogEntry[]): string[] {
    return [...new Set(entries.map((entry) => entry.event || ''))].filter(Boolean);
}

export function getAuditEventClassName(event: string | null): string {
    if (event?.includes('create')) return 'bg-success/10 text-success-text';
    if (event?.includes('update')) return 'bg-warning/10 text-warning-text';
    if (event?.includes('delete')) return 'bg-destructive/10 text-destructive';
    return 'bg-info/10 text-accent-text';
}

export function formatAuditEvent(event: string | null, fallback: string): string {
    return event?.replace(/_/g, ' ') || fallback;
}

export function formatAuditUser(
    userId: number | null,
    systemLabel: string,
    unknownUserLabel: string,
    resolveUserName?: (userId: number) => string | null | undefined,
): string {
    if (!userId) return systemLabel;
    return resolveUserName?.(userId) || unknownUserLabel;
}
