import { humanizeCode, translateCode } from '@/lib/humanizeCode';
import type { Tone } from '@/lib/tones';
import type { RecentLogEntry } from '@/services/adminApi';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function getAuditEventTypes(entries: RecentLogEntry[]): string[] {
    return [...new Set(entries.map((entry) => entry.event || ''))].filter(Boolean);
}

/** Badge tone of an audit event: create / update / delete read as success / warning / danger. */
export function getAuditEventTone(event: string | null): Tone {
    if (event?.includes('failed')) return 'danger';
    if (event?.includes('create')) return 'success';
    if (event?.includes('update')) return 'warning';
    if (event?.includes('delete')) return 'danger';
    return 'info';
}

/**
 * Display name of an audit event (GAP-D-02): `admin:audit.events.<code>` when a
 * translation exists, otherwise the humanized code. Without `t` only the
 * humanized code is returned.
 */
export function formatAuditEvent(event: string | null, fallback: string, t?: Translate): string {
    if (!event) return fallback;
    return t ? translateCode(t, 'audit.events', event) : humanizeCode(event);
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
