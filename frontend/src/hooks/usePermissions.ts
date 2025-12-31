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

    // Privileged users can manage access (those with global access scope)
    // For now, we check admin/cro roles as a proxy for privileged status
    const isPrivileged = isAdminOrCro || user?.role === 'risk_manager';

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
        // Approvals permission for workflow management
        canResolveApprovals: hasPermission('approvals', 'write'),
        // Access management permissions
        canManageAccess: isPrivileged,  // Privileged users can view/edit access
        canManagePrivileged: isAdminOrCro,  // Only admin/CRO can toggle privileged status
        isAdmin: isAdminOrCro,
        isPrivileged,
        user,
    };
}

