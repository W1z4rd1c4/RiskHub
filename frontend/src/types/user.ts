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
