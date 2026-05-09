import type { MeCapabilities } from '@/services/authApi';
import { isStrictCapabilitiesEnabled } from '@/services/capabilityFlags';

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

    if (!strictCapabilities || !meCapabilities) {
        return buildLegacyAuthz(user, hasPermission);
    }

    const can = (action: string, resource: string): boolean => {
        const key = `${resource}:${action}`;
        return meCapabilities.resource_permissions[key] === true;
    };

    const canViewUserDirectory = meCapabilities.can_view_user_directory;
    const canViewAccessUsers = meCapabilities.can_view_access_users;
    const canViewDepartmentAccessUsers = meCapabilities.can_view_department_access_users;
    const canViewUsersRoute = canViewAccessUsers || canViewDepartmentAccessUsers || canViewUserDirectory;
    const canManageAccess = meCapabilities.can_manage_access;
    const canViewDepartmentAccess = meCapabilities.can_view_department_access;
    const canViewAdminConsole = meCapabilities.can_view_admin_console;
    const canViewRiskHub = meCapabilities.can_view_riskhub;
    const canViewGovernance = meCapabilities.can_view_governance;
    const canViewActivityLog = meCapabilities.can_view_activity_log;
    const canViewCommittee = meCapabilities.can_view_committee;
    const canViewUsersPage = meCapabilities.can_view_users_page;
    const isSecondLine = meCapabilities.is_second_line;

    const canReadRisks = meCapabilities.can_read_risks;
    const canReadControls = meCapabilities.can_read_controls;
    const canReadVendors = meCapabilities.can_read_vendors;
    const canReadDepartments = meCapabilities.can_read_departments;

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
