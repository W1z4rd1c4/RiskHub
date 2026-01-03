export type DirectoryUserDiff = {
    external_id: string;
    email?: string | null;
    user_principal_name?: string | null;
    user_id?: number | null;
    action: 'create' | 'update' | 'deactivate' | 'noop' | 'error';
    changes?: Record<string, { old: string | number | boolean | null; new: string | number | boolean | null }> | null;
    error?: string | null;
};

export type DirectorySyncPreview = {
    created_count: number;
    updated_count: number;
    deactivated_count: number;
    error_count: number;
    diffs: DirectoryUserDiff[];
};

export type DirectorySyncLogRead = {
    id: number;
    started_at: string;
    finished_at?: string | null;
    status: string;
    created_count: number;
    updated_count: number;
    deactivated_count: number;
    error_count: number;
    errors?: Record<string, unknown>[] | null;
    created_at: string;
};
