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
        ['risk_create', 'bg-success/10 text-success-text'],
        ['risk_update', 'bg-warning/10 text-warning-text'],
        ['risk_delete', 'bg-destructive/10 text-destructive'],
        ['risk_archive', 'bg-info/10 text-accent-text'],
        [null, 'bg-info/10 text-accent-text'],
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
