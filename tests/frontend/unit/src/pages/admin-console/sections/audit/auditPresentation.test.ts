import { describe, expect, it } from 'vitest';

import {
    formatAuditEvent,
    formatAuditUser,
    getAuditEventTone,
    getAuditEventTypes,
} from '@/pages/admin-console/sections/audit/auditPresentation';

describe('auditPresentation', () => {
    it('deduplicates non-empty audit event types', () => {
        expect(getAuditEventTypes([
            { event: 'risk_create' },
            { event: 'risk_create' },
            { event: null },
            { event: '' },
            { event: 'risk_update' },
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
            key === 'audit.events.create' ? 'Created' : String(options?.defaultValue ?? key);

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
