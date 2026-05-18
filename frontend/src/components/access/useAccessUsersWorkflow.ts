import { useMemo } from 'react';

import type { AccessUserRead } from '@/types/access';

export type AccessUsersWorkflowState = {
    importedUserTransition: ImportedUserTransition | null;
    actionModelsByUserId: Map<number, AccessUserActionModel>;
    presentationModelsByUserId: Map<number, AccessUserPresentationModel>;
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

type AccessUserActionModelOptions = {
    defaultAllowed?: boolean;
};

function unknownText(label: string): string {
    return `Unknown ${label}`;
}

export function buildAccessUserActionModel(
    user: AccessUserRead,
    options: AccessUserActionModelOptions = {},
): AccessUserActionModel {
    const capabilities = user.capabilities;
    const defaultAllowed = options.defaultAllowed ?? true;
    const canChangeStatus = capabilities?.can_change_active_status ?? capabilities?.can_deactivate ?? defaultAllowed;

    const canEdit = capabilities
        ? capabilities.can_edit_business_access === true
            || capabilities.can_edit_identity === true
            || capabilities.can_edit_role === true
        : defaultAllowed;

    return {
        canEdit,
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
    const { importedUserId, importedUserName, isAccessMode, users } = options;
    const importedUserTransition = useMemo(
        () => resolveImportedUserTransition({ importedUserId, importedUserName, isAccessMode, users }),
        [importedUserId, importedUserName, isAccessMode, users],
    );
    const actionModelsByUserId = useMemo(
        () => new Map(users.map((user) => [user.id, buildAccessUserActionModel(user, { defaultAllowed: false })])),
        [users],
    );
    const presentationModelsByUserId = useMemo(
        () => new Map(users.map((user) => [user.id, buildAccessUserPresentationModel(user)])),
        [users],
    );

    return {
        actionModelsByUserId,
        importedUserTransition,
        presentationModelsByUserId,
    };
}
