import type { RoleWithPermissions } from '@/types/access';

const SAFE_ROLE_NAMES = ['control_owner', 'viewer', 'department_head'];
const PRIVILEGED_ROLE_NAMES = ['admin', 'cro', 'risk_manager'];

export function selectSafeDefaultRole(roles: RoleWithPermissions[]): RoleWithPermissions | undefined {
    for (const safeName of SAFE_ROLE_NAMES) {
        const matchingRole = roles.find((role) => role.name === safeName);
        if (matchingRole) return matchingRole;
    }

    return roles.find((role) => !PRIVILEGED_ROLE_NAMES.includes(role.name));
}
