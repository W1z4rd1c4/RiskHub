import { useCallback, useEffect, useState } from 'react';

import { useUsersPageFilters } from '@/hooks/useUsersPageFilters';
import { accessApi } from '@/services/accessApi';
import { apiClient } from '@/services/apiClient';
import { logError } from '@/services/logger';
import { userDirectoryApi } from '@/services/userDirectoryApi';
import type { AccessUserRead } from '@/types/access';
import type { UserDirectoryEntry, UserDirectoryRoleFacet } from '@/types/user';

import type { UsersPageMode } from './usersPageTypes';

export const DIRECTORY_PAGE_SIZE = 50;

interface UseUsersPageDataOptions {
    currentUserLoaded: boolean;
    pageMode: UsersPageMode;
}

export function useUsersPageData({ currentUserLoaded, pageMode }: UseUsersPageDataOptions) {
    const [users, setUsers] = useState<AccessUserRead[]>([]);
    const [directoryUsers, setDirectoryUsers] = useState<UserDirectoryEntry[]>([]);
    const [directoryAvailableRoles, setDirectoryAvailableRoles] = useState<UserDirectoryRoleFacet[]>([]);
    const [directoryTotal, setDirectoryTotal] = useState(0);
    const [directoryPage, setDirectoryPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);

    const isDirectoryMode = pageMode === 'directory';
    const filters = useUsersPageFilters({
        accessUsers: users,
        directoryUsers,
    });

    const resetDirectoryData = useCallback(() => {
        setDirectoryUsers([]);
        setDirectoryAvailableRoles([]);
        setDirectoryTotal(0);
    }, []);

    const fetchUsers = useCallback(async () => {
        try {
            setIsLoading(true);
            setLoadErrorKey(null);
            if (pageMode === 'access') {
                const data = await accessApi.listAccessUsers();
                setUsers(data);
                resetDirectoryData();
                return;
            }
            if (pageMode === 'department-access') {
                const data = await accessApi.listDepartmentAccessUsers();
                setUsers(data);
                resetDirectoryData();
                return;
            }
            if (pageMode === 'directory') {
                const data = await userDirectoryApi.listDirectoryUsers({
                    q: filters.searchTerm || undefined,
                    role_name: filters.roleFilter !== 'all' ? filters.roleFilter : undefined,
                    skip: (directoryPage - 1) * DIRECTORY_PAGE_SIZE,
                    limit: DIRECTORY_PAGE_SIZE,
                });
                setUsers([]);
                setDirectoryUsers(data.items);
                setDirectoryAvailableRoles(data.available_roles ?? []);
                setDirectoryTotal(data.total);
                return;
            }

            setUsers([]);
            resetDirectoryData();
        } catch (error) {
            logError('Failed to fetch users.', error);
            setUsers([]);
            resetDirectoryData();
            setLoadErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setIsLoading(false);
        }
    }, [directoryPage, filters.roleFilter, filters.searchTerm, pageMode, resetDirectoryData]);

    useEffect(() => {
        if (currentUserLoaded && pageMode !== 'forbidden') {
            void fetchUsers();
        }
    }, [currentUserLoaded, fetchUsers, pageMode]);

    useEffect(() => {
        if (isDirectoryMode) {
            setDirectoryPage(1);
        }
    }, [filters.roleFilter, filters.searchTerm, isDirectoryMode]);

    return {
        directoryAvailableRoles,
        directoryPage,
        directoryTotal,
        directoryUsers,
        fetchUsers,
        filters,
        isLoading,
        loadErrorKey,
        setDirectoryPage,
        users,
    };
}
