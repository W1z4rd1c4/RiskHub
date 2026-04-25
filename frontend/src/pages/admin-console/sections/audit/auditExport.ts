import type { RecentLogEntry } from '@/services/adminApi';

const AUDIT_EXPORT_HEADERS = ['Timestamp', 'Level', 'Event', 'User ID', 'IP', 'Request ID', 'Details'];

function quoteCsv(value: unknown): string {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function triggerDownload(blob: Blob, filename: string): void {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

export function buildAuditCsv(entries: RecentLogEntry[]): string {
    const rows = entries.map((entry) => [
        entry.timestamp,
        entry.level,
        entry.event,
        entry.user_id,
        entry.client_ip,
        entry.request_id,
        JSON.stringify(entry.extra),
    ]);

    return [AUDIT_EXPORT_HEADERS, ...rows].map((row) => row.map(quoteCsv).join(',')).join('\n');
}

export function exportAuditLogsToCsv(entries: RecentLogEntry[]): void {
    if (entries.length === 0) return;
    const blob = new Blob([buildAuditCsv(entries)], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `riskhub_audit_logs_${new Date().toISOString()}.csv`);
}

export function exportAuditLogsToJson(entries: RecentLogEntry[]): void {
    if (entries.length === 0) return;
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
    triggerDownload(blob, `riskhub_audit_logs_${new Date().toISOString()}.json`);
}
