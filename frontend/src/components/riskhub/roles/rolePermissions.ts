import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { PermissionRead, RoleHubRead } from '@/services/riskHubApi';

export interface RoleActionState {
    canDelete: boolean;
    canRestore: boolean;
    canUpdate: boolean;
}

export function groupPermissionsByResource(
    permissions: PermissionRead[],
): Record<string, PermissionRead[]> {
    return permissions.reduce<Record<string, PermissionRead[]>>((groups, permission) => {
        groups[permission.resource] ??= [];
        groups[permission.resource].push(permission);
        return groups;
    }, {});
}

export function selectedPermissionIdsForRole(
    role: RoleHubRead | null | undefined,
    permissions: PermissionRead[],
): number[] {
    if (!role) {
        return [];
    }

    return permissions
        .filter((permission) => role.permissions.includes(`${permission.resource}:${permission.action}`))
        .map((permission) => permission.id);
}

export function normalizeRoleIdentifier(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

export function getRoleActionState(role: RoleHubRead): RoleActionState {
    return {
        canUpdate: resolveCapabilityFlag(role.capabilities, 'can_update'),
        canDelete: resolveCapabilityFlag(role.capabilities, 'can_delete'),
        canRestore: resolveCapabilityFlag(role.capabilities, 'can_restore'),
    };
}
