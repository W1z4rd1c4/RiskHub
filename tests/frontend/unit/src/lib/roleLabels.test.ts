import { afterAll, describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import type { SafeTFunction } from '@/i18n/hooks';
import { getRoleLabel } from '@/lib/roleLabels';

const t = ((key: string, options?: Record<string, unknown>) => i18n.t(key, options)) as SafeTFunction;

/** Audit GAP-D-06: role codes render as translated role names, never raw codes. */
describe('getRoleLabel', () => {
    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it.each([
        ['en', 'risk_manager', 'Risk Manager'],
        ['en', 'department_head', 'Department Head'],
        ['cs', 'risk_manager', 'Risk manažer'],
        ['cs', 'employee', 'Zaměstnanec'],
    ] as const)('translates seeded roles (%s %s)', async (language, role, expected) => {
        await i18n.changeLanguage(language);
        expect(getRoleLabel(role, t)).toBe(expected);
    });

    it('humanizes custom role codes and tolerates empty input', () => {
        expect(getRoleLabel('it_ops-lead', t)).toBe('It ops lead');
        expect(getRoleLabel(null, t)).toBe('');
    });
});
