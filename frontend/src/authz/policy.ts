import type { MeCapabilities } from '@/services/authApi';
import { isStrictCapabilitiesEnabled } from '@/services/capabilityFlags';
import { resolveCapabilityFlag } from '@/lib/capabilities';

export type PermissionChecker = (resource: string, action: string) => boolean;
export type CapabilityChecker = (action: string, resource: string) => boolean;

export type AuthUser = {
    role: string;
    access_scope: 'global' | 'department' | 'manager';
    me_capabilities?: MeCapabilities | null;
} | null;

export type Authz = {
    isAuthenticated: boolean;
    isPlatformAdmin: boolean;
    isCRO: boolean;
    isRiskManager: boolean;
    isCompliance: boolean;
    isDepartmentHead: boolean;
    hasGlobalScope: boolean;
    canViewUserDirectory: boolean;
    canViewAccessUsers: boolean;
    canViewDepartmentAccessUsers: boolean;
    canViewUsersRoute: boolean;
    canManageAccess: boolean;
    canViewDepartmentAccess: boolean;
    canViewAdminConsole: boolean;
    canViewRiskHub: boolean;
    canViewGovernance: boolean;
    canViewActivityLog: boolean;
    canViewCommittee: boolean;
    canViewUsersPage: boolean;
    isSecondLine: boolean;
    canReadRisks: boolean;
    canReadControls: boolean;
    canReadVendors: boolean;
    canReadDepartments: boolean;
    can: CapabilityChecker;
};

function buildDenyAllAuthz(isAuthenticated: boolean): Authz {
    // Strict-mode fail-safe: without backend capability metadata we deny every
    // capability-gated surface instead of silently reverting to the permissive
    // legacy rules. Only session identity survives.
    return {
        isAuthenticated,
        isPlatformAdmin: false,
        isCRO: false,
        isRiskManager: false,
        isCompliance: false,
        isDepartmentHead: false,
        hasGlobalScope: false,
        canViewUserDirectory: false,
        canViewAccessUsers: false,
        canViewDepartmentAccessUsers: false,
        canViewUsersRoute: false,
        canManageAccess: false,
        canViewDepartmentAccess: false,
        canViewAdminConsole: false,
        canViewRiskHub: false,
        canViewGovernance: false,
        canViewActivityLog: false,
        canViewCommittee: false,
        canViewUsersPage: false,
        isSecondLine: false,
        canReadRisks: false,
        canReadControls: false,
        canReadVendors: false,
        canReadDepartments: false,
        can: () => false,
    };
}

function buildLegacyAuthz(user: AuthUser, hasPermission: PermissionChecker): Authz {
    const isAuthenticated = !!user;
    const isPlatformAdmin = user?.role === 'admin';
    const isCRO = user?.role === 'cro';
    const isRiskManager = user?.role === 'risk_manager';
    const isCompliance = user?.role === 'compliance';
    const isDepartmentHead = user?.role === 'department_head';
    const hasGlobalScope = user?.access_scope === 'global';
    const can = (action: string, resource: string): boolean => hasPermission(resource, action);
    const canViewUserDirectory = hasPermission('users', 'read');
    const canViewAccessUsers = hasGlobalScope;
    const canViewDepartmentAccessUsers = isDepartmentHead;
    const canViewUsersRoute = canViewAccessUsers || canViewDepartmentAccessUsers || canViewUserDirectory;
    const canManageAccess = canViewAccessUsers;
    const canViewDepartmentAccess = canViewDepartmentAccessUsers || canViewAccessUsers;

    return {
        isAuthenticated,
        isPlatformAdmin,
        isCRO,
        isRiskManager,
        isCompliance,
        isDepartmentHead,
        hasGlobalScope,
        canViewUserDirectory,
        canViewAccessUsers,
        canViewDepartmentAccessUsers,
        canViewUsersRoute,
        canManageAccess,
        canViewDepartmentAccess,
        canViewAdminConsole: isPlatformAdmin,
        canViewRiskHub: isCRO,
        canViewGovernance: !isPlatformAdmin && hasGlobalScope && hasPermission('users', 'write'),
        canViewActivityLog: !isPlatformAdmin && hasPermission('activity_log', 'read'),
        canViewCommittee: (hasGlobalScope && !isPlatformAdmin) || isDepartmentHead,
        canViewUsersPage: canViewUsersRoute,
        isSecondLine: isRiskManager || isCompliance,
        canReadRisks: hasPermission('risks', 'read'),
        canReadControls: hasPermission('controls', 'read'),
        canReadVendors: hasPermission('vendors', 'read'),
        canReadDepartments: hasPermission('departments', 'read'),
        can,
    };
}

export function buildAuthz(
    user: AuthUser,
    hasPermission: PermissionChecker,
    meCapabilities: MeCapabilities | null | undefined = user?.me_capabilities,
    strictCapabilities = isStrictCapabilitiesEnabled(),
): Authz {
    const isAuthenticated = !!user;
    const isPlatformAdmin = user?.role === 'admin';
    const isCRO = user?.role === 'cro';
    const isRiskManager = user?.role === 'risk_manager';
    const isCompliance = user?.role === 'compliance';
    const isDepartmentHead = user?.role === 'department_head';
    const hasGlobalScope = user?.access_scope === 'global';

    if (!strictCapabilities) {
        return buildLegacyAuthz(user, hasPermission);
    }
    if (!meCapabilities) {
        return buildDenyAllAuthz(isAuthenticated);
    }

    const can = (action: string, resource: string): boolean => {
        const key = `${resource}:${action}`;
        return resolveCapabilityFlag(meCapabilities.resource_permissions, key);
    };

    const canViewUserDirectory = resolveCapabilityFlag(meCapabilities, 'can_view_user_directory');
    const canViewAccessUsers = resolveCapabilityFlag(meCapabilities, 'can_view_access_users');
    const canViewDepartmentAccessUsers = resolveCapabilityFlag(meCapabilities, 'can_view_department_access_users');
    const canViewUsersRoute = canViewAccessUsers || canViewDepartmentAccessUsers || canViewUserDirectory;
    const canManageAccess = resolveCapabilityFlag(meCapabilities, 'can_manage_access');
    const canViewDepartmentAccess = resolveCapabilityFlag(meCapabilities, 'can_view_department_access');
    const canViewAdminConsole = resolveCapabilityFlag(meCapabilities, 'can_view_admin_console');
    const canViewRiskHub = resolveCapabilityFlag(meCapabilities, 'can_view_riskhub');
    const canViewGovernance = resolveCapabilityFlag(meCapabilities, 'can_view_governance');
    const canViewActivityLog = resolveCapabilityFlag(meCapabilities, 'can_view_activity_log');
    const canViewCommittee = resolveCapabilityFlag(meCapabilities, 'can_view_committee');
    const canViewUsersPage = resolveCapabilityFlag(meCapabilities, 'can_view_users_page');
    const isSecondLine = resolveCapabilityFlag(meCapabilities, 'is_second_line');

    const canReadRisks = resolveCapabilityFlag(meCapabilities, 'can_read_risks');
    const canReadControls = resolveCapabilityFlag(meCapabilities, 'can_read_controls');
    const canReadVendors = resolveCapabilityFlag(meCapabilities, 'can_read_vendors');
    const canReadDepartments = resolveCapabilityFlag(meCapabilities, 'can_read_departments');

    return {
        isAuthenticated,
        isPlatformAdmin,
        isCRO,
        isRiskManager,
        isCompliance,
        isDepartmentHead,
        hasGlobalScope,
        canViewUserDirectory,
        canViewAccessUsers,
        canViewDepartmentAccessUsers,
        canViewUsersRoute,
        canManageAccess,
        canViewDepartmentAccess,
        canViewAdminConsole,
        canViewRiskHub,
        canViewGovernance,
        canViewActivityLog,
        canViewCommittee,
        canViewUsersPage,
        isSecondLine,
        canReadRisks,
        canReadControls,
        canReadVendors,
        canReadDepartments,
        can,
    };
}
