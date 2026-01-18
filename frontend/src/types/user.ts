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
    permissions: string[];
}

/**
 * User lookup entry from /users/lookup endpoint.
 * Used for read-only directory view by non-privileged users.
 */
export interface UserLookup {
    id: number;
    name: string;
    email: string;
    role_name?: string;
    department_id?: number;
    department_name?: string;
    manager_id?: number;
}
