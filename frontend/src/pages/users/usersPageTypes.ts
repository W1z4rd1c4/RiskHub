export type UsersPageMode = 'access' | 'department-access' | 'directory' | 'forbidden';

export type UsersPageLocationState = {
    nativeInvitation?: { user_id: number; name: string; email: string; delivery_status: 'pending' | 'sent' | 'failed' };
    importedUserId?: number;
    importedUserName?: string;
} | null;
