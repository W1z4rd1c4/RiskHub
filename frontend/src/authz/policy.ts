export type PermissionChecker = (resource: string, action: string) => boolean;

export type AuthUser = {
    role: string;
    access_scope: 'global' | 'department' | 'manager';
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
    canEditAccessUsers: boolean;
    canViewDepartmentAccess: boolean;
    canViewAdminConsole: boolean;
    canViewRiskHub: boolean;
    canViewGovernance: boolean;
    canViewActivityLog: boolean;
    canViewCommittee: boolean;
    canViewUsersPage: boolean;
    canSendRiskQuestionnaires: boolean;
    canRequestRiskClarification: boolean;
    isSecondLine: boolean;
    canReadRisks: boolean;
    canReadControls: boolean;
    canReadVendors: boolean;
    canWriteRisks: boolean;
    canWriteControls: boolean;
    canWriteVendors: boolean;
    canSubmitKri: boolean;
};

export function buildAuthz(user: AuthUser, hasPermission: PermissionChecker): Authz {
    const isAuthenticated = !!user;
    const isPlatformAdmin = user?.role === 'admin';
    const isCRO = user?.role === 'cro';
    const isRiskManager = user?.role === 'risk_manager';
    const isCompliance = user?.role === 'compliance';
    const isDepartmentHead = user?.role === 'department_head';
    const hasGlobalScope = user?.access_scope === 'global';

    const canViewUserDirectory = hasPermission('users', 'read');
    const canViewAccessUsers = hasGlobalScope;
    const canViewDepartmentAccessUsers = isDepartmentHead;
    const canViewUsersRoute = canViewAccessUsers || canViewDepartmentAccessUsers || canViewUserDirectory;
    const canManageAccess = canViewAccessUsers;
    const canEditAccessUsers = isPlatformAdmin || isCRO;
    const canViewDepartmentAccess = canViewDepartmentAccessUsers || canViewAccessUsers;
    const canViewAdminConsole = isPlatformAdmin;
    const canViewRiskHub = isCRO;
    const canViewGovernance = isCRO;
    const canViewActivityLog = !isPlatformAdmin && hasPermission('activity_log', 'read');
    const canViewCommittee = (hasGlobalScope && !isPlatformAdmin) || isDepartmentHead;
    const canViewUsersPage = canViewUsersRoute;
    const canSendRiskQuestionnaires = isRiskManager || isCRO;
    const canRequestRiskClarification = isCRO || isRiskManager;
    const isSecondLine = isRiskManager || isCompliance;

    const canReadRisks = hasPermission('risks', 'read');
    const canReadControls = hasPermission('controls', 'read');
    const canReadVendors = hasPermission('vendors', 'read');
    const canWriteRisks = hasPermission('risks', 'write');
    const canWriteControls = hasPermission('controls', 'write');
    const canWriteVendors = hasPermission('vendors', 'write');
    const canSubmitKri = hasPermission('kri', 'submit');

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
        canEditAccessUsers,
        canViewDepartmentAccess,
        canViewAdminConsole,
        canViewRiskHub,
        canViewGovernance,
        canViewActivityLog,
        canViewCommittee,
        canViewUsersPage,
        canSendRiskQuestionnaires,
        canRequestRiskClarification,
        isSecondLine,
        canReadRisks,
        canReadControls,
        canReadVendors,
        canWriteRisks,
        canWriteControls,
        canWriteVendors,
        canSubmitKri,
    };
}
