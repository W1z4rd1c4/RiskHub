import { useAuth } from '@/contexts/AuthContext';
import { useAuthz } from '@/authz/useAuthz';

/**
 * Permission helper hook.
 * Uses AuthContext.hasPermission as the single source of truth for all permission checks.
 * 
 * KRI permissions inherit from risks (KRIs are risk sub-entities).
 */
export function usePermissions() {
    const { user, hasPermission } = useAuth();
    const authz = useAuthz();
    const isAdminOrCro = authz.isPlatformAdmin || authz.isCRO;
    const canManageUserLifecycle = authz.isPlatformAdmin;

    return {
        hasPermission,
        // User management permissions
        canViewUsers: authz.canViewUserDirectory,
        canManageUsers: canManageUserLifecycle,
        // Risk permissions
        canCreateRisks: hasPermission('risks', 'write'),
        canEditRisks: hasPermission('risks', 'write'),
        canDeleteRisks: hasPermission('risks', 'delete'),
        // Control permissions
        canCreateControls: hasPermission('controls', 'write'),
        canEditControls: hasPermission('controls', 'write'),
        canDeleteControls: hasPermission('controls', 'delete'),
        // KRI permissions inherit from risks (KRIs are risk sub-entities)
        canCreateKRIs: hasPermission('risks', 'write'),
        canEditKRIs: hasPermission('risks', 'write'),
        canDeleteKRIs: hasPermission('risks', 'delete'),
        // KRI value recording - requires kri:submit permission only
        // Note: KRIDetailPage also allows reporting owners to record (checked in component)
        canRecordKRI: hasPermission('kri', 'submit'),
        // Approvals permission for workflow management
        canResolveApprovals: hasPermission('approvals', 'write'),
        // Access management permissions
        canManageAccess: authz.canManageAccess,  // Users with global scope can view access data
        canEditAccessUsers: authz.canEditAccessUsers, // Admin/CRO only for access-user mutations
        canManagePrivileged: isAdminOrCro,  // Only admin/CRO can toggle privileged status/roles
        canViewUsersRoute: authz.canViewUsersRoute,
        canViewAccessUsers: authz.canViewAccessUsers,
        canViewDepartmentAccessUsers: authz.canViewDepartmentAccessUsers,
        canViewUserDirectory: authz.canViewUserDirectory,
        // Activity Log: Admin is console-only and should not access business views.
        // Follow authz here so test/demo fixtures cannot accidentally re-enable the route.
        canViewActivityLog: authz.canViewActivityLog,
        isAdmin: isAdminOrCro,
        isPrivileged: authz.hasGlobalScope,
        user,
    };
}
