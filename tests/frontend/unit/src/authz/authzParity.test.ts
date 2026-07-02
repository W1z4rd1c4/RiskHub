import { describe, expect, it } from 'vitest';
import { buildAuthz } from '@/authz/policy';
import type { AuthUser } from '@/authz/policy';
import type { MeCapabilities } from '@/services/authApi';

/**
 * Parity lock between the legacy role/permission adapter and the strict
 * backend-capability adapter. The fixture mirrors the backend derivation in
 * backend/app/services/_authorization_capabilities/me.py verbatim; if either
 * side's rules drift, this test pins the divergence before a rollout flip.
 */

const RESOURCE_PERMISSION_PAIRS: Array<[string, string]> = [
    ['risks', 'read'],
    ['controls', 'read'],
    ['issues', 'read'],
    ['vendors', 'read'],
    ['departments', 'read'],
    ['users', 'read'],
    ['users', 'write'],
    ['activity_log', 'read'],
];

type MatrixUser = NonNullable<AuthUser>;

function backendMeCapabilities(user: MatrixUser, granted: ReadonlySet<string>): MeCapabilities {
    const roleName = user.role;
    const hasGlobalScope = user.access_scope === 'global';
    const isPlatformAdmin = roleName === 'admin';
    const isDepartmentHead = roleName === 'department_head';

    const resource_permissions: Record<string, boolean> = Object.fromEntries(
        RESOURCE_PERMISSION_PAIRS.map(([resource, action]) => {
            const key = `${resource}:${action}`;
            return [key, granted.has(key)];
        }),
    );

    const can_view_user_directory = resource_permissions['users:read'];
    const can_view_access_users = hasGlobalScope;
    const can_view_department_access_users = isDepartmentHead;
    const can_view_users_route =
        can_view_access_users || can_view_department_access_users || can_view_user_directory;
    const can_view_department_access = can_view_department_access_users || can_view_access_users;

    return {
        can_view_user_directory,
        can_view_access_users,
        can_view_department_access_users,
        can_view_users_route,
        can_manage_access: can_view_access_users,
        can_view_department_access,
        can_view_admin_console: isPlatformAdmin,
        can_view_riskhub: roleName === 'cro',
        can_view_governance: !isPlatformAdmin && hasGlobalScope && resource_permissions['users:write'],
        can_view_activity_log: !isPlatformAdmin && resource_permissions['activity_log:read'],
        can_view_committee: (hasGlobalScope && !isPlatformAdmin) || isDepartmentHead,
        can_view_users_page: can_view_users_route,
        is_second_line: roleName === 'risk_manager' || roleName === 'compliance',
        can_read_risks: resource_permissions['risks:read'],
        can_read_controls: resource_permissions['controls:read'],
        can_read_vendors: resource_permissions['vendors:read'],
        can_read_departments: resource_permissions['departments:read'],
        resource_permissions,
    };
}

const BOOLEAN_FIELDS = [
    'isAuthenticated',
    'isPlatformAdmin',
    'isCRO',
    'isRiskManager',
    'isCompliance',
    'isDepartmentHead',
    'hasGlobalScope',
    'canViewUserDirectory',
    'canViewAccessUsers',
    'canViewDepartmentAccessUsers',
    'canViewUsersRoute',
    'canManageAccess',
    'canViewDepartmentAccess',
    'canViewAdminConsole',
    'canViewRiskHub',
    'canViewGovernance',
    'canViewActivityLog',
    'canViewCommittee',
    'canViewUsersPage',
    'isSecondLine',
    'canReadRisks',
    'canReadControls',
    'canReadVendors',
    'canReadDepartments',
] as const;

const MATRIX: Array<{ name: string; user: MatrixUser; granted: string[] }> = [
    {
        name: 'platform admin, global',
        user: { role: 'admin', access_scope: 'global' },
        granted: ['users:read', 'users:write', 'activity_log:read', 'departments:read'],
    },
    {
        name: 'cro, global, everything',
        user: { role: 'cro', access_scope: 'global' },
        granted: RESOURCE_PERMISSION_PAIRS.map(([r, a]) => `${r}:${a}`),
    },
    {
        name: 'risk manager, global',
        user: { role: 'risk_manager', access_scope: 'global' },
        granted: ['risks:read', 'controls:read', 'issues:read', 'vendors:read', 'departments:read', 'activity_log:read'],
    },
    {
        name: 'risk manager, department-scoped',
        user: { role: 'risk_manager', access_scope: 'department' },
        granted: ['risks:read', 'controls:read', 'issues:read', 'vendors:read', 'departments:read', 'activity_log:read'],
    },
    {
        name: 'compliance, global',
        user: { role: 'compliance', access_scope: 'global' },
        granted: ['risks:read', 'activity_log:read'],
    },
    {
        name: 'department head',
        user: { role: 'department_head', access_scope: 'department' },
        granted: ['users:read', 'risks:read', 'departments:read'],
    },
    {
        name: 'employee, department-scoped',
        user: { role: 'employee', access_scope: 'department' },
        granted: ['risks:read'],
    },
    {
        name: 'viewer, manager-scoped, no permissions',
        user: { role: 'viewer', access_scope: 'manager' },
        granted: [],
    },
];

describe('legacy vs strict authz parity', () => {
    it.each(MATRIX)('legacy and strict adapters agree: $name', ({ user, granted }) => {
        const grantedSet = new Set(granted);
        const hasPermission = (resource: string, action: string) => grantedSet.has(`${resource}:${action}`);
        const meCapabilities = backendMeCapabilities(user, grantedSet);

        const legacy = buildAuthz(user, hasPermission, null, false);
        // Strict mode must not consult hasPermission at all.
        const strict = buildAuthz(user, () => false, meCapabilities, true);

        for (const field of BOOLEAN_FIELDS) {
            expect(strict[field], field).toBe(legacy[field]);
        }
        for (const [resource, action] of RESOURCE_PERMISSION_PAIRS) {
            expect(strict.can(action, resource), `can(${action}, ${resource})`).toBe(legacy.can(action, resource));
        }
    });
});

describe('strict mode fail-safe', () => {
    it('denies capability-gated surfaces when capabilities are missing in strict mode', () => {
        const user: MatrixUser = { role: 'cro', access_scope: 'global' };
        const permissive = () => true;

        const authz = buildAuthz(user, permissive, null, true);

        expect(authz.isAuthenticated).toBe(true);
        for (const field of BOOLEAN_FIELDS.filter((name) => name !== 'isAuthenticated')) {
            expect(authz[field], field).toBe(false);
        }
        expect(authz.can('read', 'risks')).toBe(false);
        expect(authz.can('write', 'users')).toBe(false);
    });

    it('still uses the legacy adapter when strict mode is off', () => {
        const user: MatrixUser = { role: 'cro', access_scope: 'global' };
        const authz = buildAuthz(user, () => true, null, false);
        expect(authz.canViewRiskHub).toBe(true);
        expect(authz.can('read', 'risks')).toBe(true);
    });
});
