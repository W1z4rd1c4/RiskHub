export type DirectoryUser = {
    id: number;
    external_id: string;
    user_principal_name?: string | null;
    email?: string | null;
    display_name: string;
    given_name?: string | null;
    surname?: string | null;
    department?: string | null;
    job_title?: string | null;
    manager_external_id?: string | null;
    account_enabled: boolean;
    employee_type: string;
    created_at: string;
    updated_at: string;
};

export type DirectoryUserCreate = {
    external_id: string;
    user_principal_name?: string;
    email?: string;
    display_name: string;
    given_name?: string;
    surname?: string;
    department?: string;
    job_title?: string;
    manager_external_id?: string;
    account_enabled: boolean;
    employee_type?: string;
    password?: string;
};

export type DirectoryUserUpdate = {
    user_principal_name?: string;
    email?: string;
    display_name?: string;
    given_name?: string;
    surname?: string;
    department?: string;
    job_title?: string;
    manager_external_id?: string;
    account_enabled?: boolean;
    employee_type?: string;
    password?: string;
};
