export type UsersPageMode = 'access' | 'department-access' | 'directory' | 'forbidden';

export type UsersPageLocationState = {
    importedUserId?: number;
    importedUserName?: string;
} | null;
