import { useAuth } from '@/contexts/AuthContext';

/**
 * Permission helper hook.
 * Uses AuthContext.hasPermission as the single source of truth for all permission checks.
 * 
 * KRI permissions inherit from risks (KRIs are risk sub-entities).
 */
export function usePermissions() {
    const { user, hasPermission } = useAuth();

    // Admin/CRO roles have special privileges
    const isAdminOrCro = user?.role === 'admin' || user?.role === 'cro';

    // Privileged users have global access scope (can manage access)
    const hasGlobalScope = user?.access_scope === 'global';

    return {
        hasPermission,
        // User management permissions
        canViewUsers: hasPermission('users', 'read'),
        canManageUsers: hasPermission('users', 'write'),
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
        // KRI value recording - requires kri:submit OR risks:write OR approvals:write
        canRecordKRI: hasPermission('kri', 'submit') || hasPermission('risks', 'write') || hasPermission('approvals', 'write'),
        // Approvals permission for workflow management
        canResolveApprovals: hasPermission('approvals', 'write'),
        // Access management permissions
        canManageAccess: hasGlobalScope,  // Users with global scope can view/edit access
        canManagePrivileged: isAdminOrCro,  // Only admin/CRO can toggle privileged status/roles
        // Activity Log: Admin is console-only and should not access business views
        // Even though admin has *:* permissions, we explicitly block them from Activity Log
        canViewActivityLog: user?.role !== 'admin' && hasPermission('activity_log', 'read'),
        isAdmin: isAdminOrCro,
        isPrivileged: hasGlobalScope,
        user,
    };
}

