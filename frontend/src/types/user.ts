export interface Role {
    id: number;
    name: string;
    display_name: string;
    description: string | null;
}

export interface UserRead {
    id: number;
    email: string;
    name: string;
    is_active: boolean;
    role: Role;
    entra_business_role?: string | null;
    department_id: number | null;
    manager_id: number | null;
    manager_name: string | null;
    created_at: string;
    updated_at: string;
}

export interface UserCreate {
    email: string;
    name: string;
    password: string;
    role_id: number;
    department_id?: number | null;
    manager_id?: number | null;
    is_active?: boolean;
}

export interface UserUpdate {
    email?: string;
    name?: string;
    password?: string;
    role_id?: number;
    department_id?: number | null;
    manager_id?: number | null;
    is_active?: boolean;
}

export interface UserBrief {
    id: number;
    email: string;
    name: string;
    role: string;
    role_display_name: string;
    entra_business_role?: string | null;
    permissions: string[];
}

/**
 * User lookup entry from /users/lookup endpoint.
 * Used for pickers, dropdowns, and scoped user search only.
 */
export interface UserLookup {
    id: number;
    name: string;
    email: string;
    role_name?: string | null;
    department_id?: number | null;
    department_name?: string | null;
    manager_id?: number | null;
}

export interface UserDirectoryEntry {
    id: number;
    name: string;
    email: string;
    role_name?: string | null;
    role_display_name?: string | null;
    department_id?: number | null;
    department_name?: string | null;
}

export interface UserDirectoryRoleFacet {
    name: string;
    display_name: string;
    count: number;
}

export interface UserDirectoryListResponse {
    items: UserDirectoryEntry[];
    available_roles: UserDirectoryRoleFacet[];
    total: number;
    skip: number;
    limit: number;
}

export interface UserShellSummary {
    unread_notifications_count: number;
    pending_approvals_count: number;
    questionnaire_inbox_count: number;
    orphan_total_count: number;
    can_view_governance: boolean;
    generated_at: string;
}
