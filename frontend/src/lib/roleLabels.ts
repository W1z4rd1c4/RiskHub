import type { SafeTFunction } from '@/i18n/hooks';
import { humanizeCode } from '@/lib/humanizeCode';

/**
 * Role code → translated role name (audit GAP-D-06). User lookups carry only
 * the role code (`Role.name`, e.g. `risk_manager`); the UI shows the
 * translated name of the seeded RBAC roles (`common:roles.*`) and a readable
 * fallback for custom roles. The code itself stays the filter value.
 */
const ROLE_LABEL_KEYS: Readonly<Record<string, string>> = {
    admin: 'common:roles.admin',
    cro: 'common:roles.cro',
    ceo: 'common:roles.ceo',
    cfo: 'common:roles.cfo',
    coo: 'common:roles.coo',
    ciso: 'common:roles.ciso',
    risk_manager: 'common:roles.risk_manager',
    actuarial: 'common:roles.actuarial',
    compliance: 'common:roles.compliance',
    internal_audit: 'common:roles.internal_audit',
    department_head: 'common:roles.department_head',
    employee: 'common:roles.employee',
    viewer: 'common:roles.viewer',
};

export function getRoleLabel(role: string | null | undefined, t: SafeTFunction): string {
    if (!role) return '';
    const key = ROLE_LABEL_KEYS[role];
    // Custom roles have no key: `it_ops` reads "It ops" instead of the raw code.
    return key ? t(key) : humanizeCode(role);
}
