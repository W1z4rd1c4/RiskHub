import { useAuth } from '@/contexts/AuthContext';

export function usePermissions() {
    const { user } = useAuth();

    const hasPermission = (resource: string, action: string) => {
        if (!user || !user.permissions) return false;

        // Admin often has "*" or "resource:*" permissions
        const requiredPermission = `${resource}:${action}`;
        return user.permissions.includes(requiredPermission) ||
            user.permissions.includes(`${resource}:*`) ||
            user.permissions.includes('*:*') ||
            user.role === 'admin' || user.role === 'cro';
    };

    return {
        hasPermission,
        canManageUsers: hasPermission('users', 'write'),
        canCreateRisks: hasPermission('risks', 'write'),
        canEditRisks: hasPermission('risks', 'write'),
        canDeleteRisks: hasPermission('risks', 'delete'),
        canCreateControls: hasPermission('controls', 'write'),
        canEditControls: hasPermission('controls', 'write'),
        canDeleteControls: hasPermission('controls', 'delete'),
        canCreateKRIs: hasPermission('kris', 'write'),
        canEditKRIs: hasPermission('kris', 'write'),
        canDeleteKRIs: hasPermission('kris', 'delete'),
        isAdmin: user?.role === 'admin' || user?.role === 'cro',
        user,
    };
}
