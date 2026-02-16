export interface DirectoryUser {
    external_id: string;
    display_name: string;
    email: string | null;
    user_principal_name: string | null;
    department: string | null;
    job_title: string | null;
    account_enabled: boolean;
    source: 'graph' | 'ad_emulator';
}

export interface DirectoryImportResponse {
    status: 'created' | 'updated';
    user_id: number;
    email: string;
    name: string;
    external_id: string;
    department_id: number | null;
    department_name: string | null;
    role_id: number;
    role_name: string | null;
    directory_sync_status: string | null;
}
