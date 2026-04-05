import type { AuthUser } from '@/services/authApi';

export function hasUserPermission(user: AuthUser | null, resource: string, action: string): boolean {
    const permissions = user?.effective_permissions ?? user?.permissions ?? [];
    return permissions.some((permission) => {
        const [permissionResource, permissionAction] = permission.split(':');
        return (permissionResource === '*' || permissionResource === resource) &&
            (permissionAction === '*' || permissionAction === action);
    });
}
