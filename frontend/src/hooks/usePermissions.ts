import { useAuth } from '@/contexts/AuthContext';
import { useAuthz } from '@/authz/useAuthz';

export function usePermissions() {
    const { user, hasPermission } = useAuth();
    const authz = useAuthz();

    return {
        hasPermission,
        canViewUsers: authz.canViewUserDirectory,
        canManageAccess: authz.canManageAccess,  // Users with global scope can view access data
        canViewUsersRoute: authz.canViewUsersRoute,
        canViewAccessUsers: authz.canViewAccessUsers,
        canViewDepartmentAccessUsers: authz.canViewDepartmentAccessUsers,
        canViewUserDirectory: authz.canViewUserDirectory,
        canViewActivityLog: authz.canViewActivityLog,
        isPrivileged: authz.hasGlobalScope,
        user,
    };
}
