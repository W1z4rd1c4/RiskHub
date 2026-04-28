import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { AccessScopeEnum, AccessUserRead, AccessUserUpdate, RoleWithPermissions } from '@/types/access';

export interface AccessEditCapabilities {
    canEditPlatformFields: boolean;
    canEditBusinessFields: boolean;
    canEditRole: boolean;
}

export interface AccessEditSelection {
    name: string;
    email: string;
    roleId: number | null;
    departmentId: number | null;
    managerId: number | null;
    scope: AccessScopeEnum;
}

export const SCOPE_OPTIONS: { value: AccessScopeEnum; labelKey: string; descriptionKey: string }[] = [
    { value: 'global', labelKey: 'admin:access.scopes.global', descriptionKey: 'admin:access.modal.scope_descriptions.global' },
    { value: 'department', labelKey: 'admin:access.scopes.department', descriptionKey: 'admin:access.modal.scope_descriptions.department' },
    { value: 'manager', labelKey: 'admin:access.scopes.manager', descriptionKey: 'admin:access.modal.scope_descriptions.manager' },
];

export function resolveAccessEditCapabilities(
    user: AccessUserRead | null,
): AccessEditCapabilities {
    const canEditPlatformFields = resolveCapabilityFlag(user?.capabilities, 'can_edit_identity');
    const canEditBusinessFields = resolveCapabilityFlag(user?.capabilities, 'can_edit_business_access');
    return {
        canEditPlatformFields,
        canEditBusinessFields,
        canEditRole: resolveCapabilityFlag(user?.capabilities, 'can_edit_role'),
    };
}

export function selectionFromUser(user: AccessUserRead): AccessEditSelection {
    return {
        name: user.name,
        email: user.email,
        roleId: user.role_id,
        departmentId: user.department_id,
        managerId: user.manager_id,
        scope: user.access_scope,
    };
}

export function filterEditableRoles(
    roles: RoleWithPermissions[],
    canEditPlatformFields: boolean,
): RoleWithPermissions[] {
    return roles.filter((role) => (canEditPlatformFields ? role.name === 'admin' : role.name !== 'admin'));
}

export function accessEditHasChanges(
    user: AccessUserRead,
    selection: AccessEditSelection,
    capabilities: AccessEditCapabilities,
): boolean {
    return (
        (capabilities.canEditPlatformFields && (selection.name !== user.name || selection.email !== user.email))
        || (capabilities.canEditRole && selection.roleId !== user.role_id)
        || (capabilities.canEditBusinessFields && selection.departmentId !== user.department_id)
        || (capabilities.canEditBusinessFields && selection.managerId !== user.manager_id)
        || (capabilities.canEditBusinessFields && selection.scope !== user.access_scope)
    );
}

export function buildAccessUserUpdate(
    user: AccessUserRead,
    selection: AccessEditSelection,
    capabilities: AccessEditCapabilities,
): AccessUserUpdate {
    const accessUpdate: AccessUserUpdate = {};

    if (capabilities.canEditRole && selection.roleId !== user.role_id) {
        accessUpdate.role_id = selection.roleId ?? undefined;
    }
    if (capabilities.canEditBusinessFields && selection.departmentId !== user.department_id) {
        accessUpdate.department_id = selection.departmentId;
    }
    if (capabilities.canEditBusinessFields && selection.managerId !== user.manager_id) {
        accessUpdate.manager_id = selection.managerId;
    }
    if (capabilities.canEditBusinessFields && selection.scope !== user.access_scope) {
        accessUpdate.access_scope = selection.scope;
    }
    if (capabilities.canEditPlatformFields && selection.name !== user.name) {
        accessUpdate.name = selection.name;
    }
    if (capabilities.canEditPlatformFields && selection.email !== user.email) {
        accessUpdate.email = selection.email;
    }

    return accessUpdate;
}
