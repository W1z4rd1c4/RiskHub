import { describe, expect, it } from 'vitest';

import {
    formatAuditEvent,
    formatAuditUser,
    getAuditEventClassName,
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
        ['risk_create', 'bg-emerald-500/20 text-emerald-400'],
        ['risk_update', 'bg-amber-500/20 text-amber-400'],
        ['risk_delete', 'bg-red-500/20 text-red-400'],
        ['risk_archive', 'bg-blue-500/20 text-blue-400'],
        [null, 'bg-blue-500/20 text-blue-400'],
    ])('maps audit event %s to a badge class', (event, expected) => {
        expect(getAuditEventClassName(event)).toBe(expected);
    });

    it('formats audit event names and falls back for missing events', () => {
        expect(formatAuditEvent('risk_create', 'Unknown')).toBe('risk create');
        expect(formatAuditEvent(null, 'Unknown')).toBe('Unknown');
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
