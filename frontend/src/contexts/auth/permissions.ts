import type { AuthUser } from '@/services/authApi';

export function hasUserPermission(user: AuthUser | null, resource: string, action: string): boolean {
    const permissions = user?.effective_permissions ?? user?.permissions ?? [];
    return permissions.some((permission) => {
        const parts = permission.split(':');
        if (parts.length !== 2) {
            return false;
        }
        const [permissionResource, permissionAction] = parts;
        if (!permissionResource || !permissionAction) {
            return false;
        }
        return (permissionResource === '*' || permissionResource === resource) &&
            (permissionAction === '*' || permissionAction === action);
    });
}
