import { useAuth } from '@/contexts/AuthContext';

/**
 * Permission helper hook.
 * Uses AuthContext.hasPermission as the single source of truth for all permission checks.
 * 
 * KRI permissions inherit from risks (KRIs are risk sub-entities).
 */
export function usePermissions() {
    const { user, hasPermission } = useAuth();

    return {
        hasPermission,
        canManageUsers: hasPermission('users', 'write'),
        canCreateRisks: hasPermission('risks', 'write'),
        canEditRisks: hasPermission('risks', 'write'),
        canDeleteRisks: hasPermission('risks', 'delete'),
        canCreateControls: hasPermission('controls', 'write'),
        canEditControls: hasPermission('controls', 'write'),
        canDeleteControls: hasPermission('controls', 'delete'),
        // KRI permissions inherit from risks (KRIs are risk sub-entities)
        canCreateKRIs: hasPermission('risks', 'write'),
        canEditKRIs: hasPermission('risks', 'write'),
        canDeleteKRIs: hasPermission('risks', 'delete'),
        // Approvals permission for workflow management
        canResolveApprovals: hasPermission('approvals', 'write'),
        isAdmin: user?.role === 'admin' || user?.role === 'cro',
        user,
    };
}
