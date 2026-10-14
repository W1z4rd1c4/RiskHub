import { afterEach, describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { formatAuditEvent } from '@/pages/admin-console/sections/audit/auditPresentation';

function auditTranslator(language: 'en' | 'cs') {
    const fixedT = i18n.getFixedT(language, 'admin');
    return (key: string, options?: Record<string, unknown>) => fixedT(
        key,
        typeof options?.defaultValue === 'string' ? options.defaultValue : key,
        options,
    );
}

// The `event` values the backend writes to the audit log (`ActivityAction` plus the two
// non-activity audit events emitted by the auth refresh and SSO token services).
const AUDIT_EVENTS = [
    'create', 'update', 'delete', 'archive', 'approve', 'reject', 'escalate', 'status_change',
    'link', 'unlink', 'login', 'failed_login', 'refresh', 'failed_refresh', 'logout', 'logout_all',
    'cancel', 'refresh_session_context_changed', 'jwks_fallback_exhausted',
] as const;

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('audit event names (GAP-D-02)', () => {
    it.each(['en', 'cs'] as const)('translates every backend audit event in %s', async (language) => {
        await i18n.changeLanguage(language);
        const t = auditTranslator(language);

        for (const event of AUDIT_EVENTS) {
            const label = formatAuditEvent(event, 'Unknown', t);
            expect(label, `${language}: ${event}`).not.toBe(`audit.events.${event}`);
            expect(label, `${language}: ${event} must not be the raw snake_case code`).not.toContain('_');
        }
    });

    it('shows Czech names to Czech users instead of English-ified snake_case', async () => {
        await i18n.changeLanguage('cs');
        const t = auditTranslator('cs');

        expect(formatAuditEvent('failed_login', 'Neznámé', t)).toBe('Neúspěšné přihlášení');
        expect(formatAuditEvent('create', 'Neznámé', t)).toBe('Vytvořeno');
    });

    it('falls back to the humanized code for an event without a translation', () => {
        const t = auditTranslator('en');

        expect(formatAuditEvent('some_future_event', 'Unknown', t)).toBe('Some future event');
        return Promise.resolve();
    });
});
