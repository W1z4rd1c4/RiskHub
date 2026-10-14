import type { RecentLogEntry } from '@/services/adminApi';
import { describe, expect, it } from 'vitest';

import {
    formatAuditEvent,
    formatAuditUser,
    getAuditEventTone,
    getAuditEventTypes,
} from '@/pages/admin-console/sections/audit/auditPresentation';

function logEntry(event: string | null): RecentLogEntry {
    return {
        timestamp: null,
        level: null,
        event,
        logger_name: null,
        request_id: null,
        user_id: null,
        client_ip: null,
        feature: null,
        extra: {},
    };
}

describe('auditPresentation', () => {
    it('deduplicates non-empty audit event types', () => {
        expect(getAuditEventTypes([
            logEntry('risk_create'),
            logEntry('risk_create'),
            logEntry(null),
            logEntry(''),
            logEntry('risk_update'),
        ])).toEqual(['risk_create', 'risk_update']);
    });

    it.each([
        ['risk_create', 'success'],
        ['risk_update', 'warning'],
        ['risk_delete', 'danger'],
        ['failed_login', 'danger'],
        ['risk_archive', 'info'],
        [null, 'info'],
    ])('maps audit event %s to the %s badge tone', (event, expected) => {
        expect(getAuditEventTone(event)).toBe(expected);
    });

    it('humanizes audit event names and falls back for missing events', () => {
        expect(formatAuditEvent('risk_create', 'Unknown')).toBe('Risk create');
        expect(formatAuditEvent(null, 'Unknown')).toBe('Unknown');
    });

    it('prefers the translation and passes the humanized code as the default (GAP-D-02)', () => {
        const t = (key: string, options?: Record<string, unknown>) =>
            key === 'audit.events.create' ? 'Created' : typeof options?.defaultValue === 'string' ? options.defaultValue : key;

        expect(formatAuditEvent('create', 'Unknown', t)).toBe('Created');
        expect(formatAuditEvent('some_new_event', 'Unknown', t)).toBe('Some new event');
        expect(formatAuditEvent(null, 'Unknown', t)).toBe('Unknown');
    });

    it('uses the system label when no user id exists', () => {
        expect(formatAuditUser(null, 'System', 'Unknown user')).toBe('System');
    });

    it('never falls back to a raw numeric user id', () => {
        expect(formatAuditUser(42, 'System', 'Unknown user')).toBe('Unknown user');
    });

    it('uses a resolved user display name when supplied', () => {
        expect(formatAuditUser(42, 'System', 'Unknown user', (userId) => `User ${userId}`)).toBe('User 42');
    });
});
