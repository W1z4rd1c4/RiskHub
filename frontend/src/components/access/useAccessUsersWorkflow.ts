import { useMemo } from 'react';

import type { AccessUserRead } from '@/types/access';

export type AccessUsersWorkflowState = {
    importedUserTransition: ImportedUserTransition | null;
};

export type AccessUserActionModel = {
    canEdit: boolean;
    canDeactivate: boolean;
    canReactivate: boolean;
    canBreakGlassEnable: boolean;
    canRunDirectoryCheck: boolean;
};

export type AccessUserPresentationModel = {
    safeName: string;
    emailText: string;
    roleText: string;
    departmentText: string;
    scopeText: string;
    directoryStatus: string | null;
};

type ImportedUserTransition = {
    user: AccessUserRead;
    messageName: string;
};

type AccessUsersWorkflowOptions = {
    isAccessMode: boolean;
    importedUserId?: number | null;
    importedUserName?: string | null;
    users: AccessUserRead[];
};

function unknownText(label: string): string {
    return `Unknown ${label}`;
}

export function buildAccessUserActionModel(user: AccessUserRead): AccessUserActionModel {
    const capabilities = user.capabilities;
    const canChangeStatus = capabilities?.can_change_active_status ?? capabilities?.can_deactivate ?? true;

    return {
        canEdit: Boolean(
            capabilities?.can_edit_business_access ?? capabilities?.can_edit_identity ?? capabilities?.can_edit_role ?? true,
        ),
        canDeactivate: Boolean(user.is_active && canChangeStatus),
        canReactivate: Boolean(!user.is_active && canChangeStatus),
        canBreakGlassEnable: Boolean(capabilities?.can_break_glass_enable ?? false),
        canRunDirectoryCheck: Boolean(user.external_id),
    };
}

export function buildAccessUserPresentationModel(user: AccessUserRead): AccessUserPresentationModel {
    return {
        safeName: user.name?.trim() || unknownText('user'),
        emailText: user.email?.trim() || unknownText('email'),
        roleText: user.role?.display_name || user.role?.name || unknownText('role'),
        departmentText: user.department_name || unknownText('department'),
        scopeText: user.scope_label || user.access_scope,
        directoryStatus: user.directory_sync_status ?? null,
    };
}

export function resolveImportedUserTransition({
    isAccessMode,
    importedUserId,
    importedUserName,
    users,
}: AccessUsersWorkflowOptions): ImportedUserTransition | null {
    if (!isAccessMode || !importedUserId || users.length === 0) {
        return null;
    }

    const importedUser = users.find((candidate) => candidate.id === importedUserId);
    if (!importedUser) {
        return null;
    }

    return {
        user: importedUser,
        messageName: importedUserName ?? importedUser.name,
    };
}

export function useAccessUsersWorkflow(options: AccessUsersWorkflowOptions): AccessUsersWorkflowState {
    const importedUserTransition = useMemo(
        () => resolveImportedUserTransition(options),
        [options.importedUserId, options.importedUserName, options.isAccessMode, options.users],
    );

    return { importedUserTransition };
}
