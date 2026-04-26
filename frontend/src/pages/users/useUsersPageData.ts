import { useCallback, useEffect, useState } from 'react';

import { useUsersPageFilters } from '@/hooks/useUsersPageFilters';
import { accessApi } from '@/services/accessApi';
import { apiClient } from '@/services/apiClient';
import { logError } from '@/services/logger';
import { userDirectoryApi } from '@/services/userDirectoryApi';
import type { AccessUserRead } from '@/types/access';
import type { UserDirectoryCapabilities, UserDirectoryEntry, UserDirectoryRoleFacet } from '@/types/user';

import type { UsersPageMode } from './usersPageTypes';

export const DIRECTORY_PAGE_SIZE = 50;

interface UseUsersPageDataOptions {
    currentUserLoaded: boolean;
    loadDirectoryCapabilities: boolean;
    pageMode: UsersPageMode;
}

export function useUsersPageData({
    currentUserLoaded,
    loadDirectoryCapabilities,
    pageMode,
}: UseUsersPageDataOptions) {
    const [users, setUsers] = useState<AccessUserRead[]>([]);
    const [directoryUsers, setDirectoryUsers] = useState<UserDirectoryEntry[]>([]);
    const [directoryAvailableRoles, setDirectoryAvailableRoles] = useState<UserDirectoryRoleFacet[]>([]);
    const [directoryCapabilities, setDirectoryCapabilities] = useState<UserDirectoryCapabilities | null>(null);
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

    const fetchDirectoryCapabilities = useCallback(async () => {
        try {
            const data = await userDirectoryApi.listDirectoryUsers({ skip: 0, limit: 1 });
            setDirectoryCapabilities(data.capabilities ?? null);
        } catch {
            setDirectoryCapabilities(null);
        }
    }, []);

    const fetchUsers = useCallback(async () => {
        try {
            setIsLoading(true);
            setLoadErrorKey(null);
            if (pageMode === 'access') {
                const data = await accessApi.listAccessUsers();
                setUsers(data);
                resetDirectoryData();
                if (loadDirectoryCapabilities) {
                    await fetchDirectoryCapabilities();
                } else {
                    setDirectoryCapabilities(null);
                }
                return;
            }
            if (pageMode === 'department-access') {
                const data = await accessApi.listDepartmentAccessUsers();
                setUsers(data);
                resetDirectoryData();
                if (loadDirectoryCapabilities) {
                    await fetchDirectoryCapabilities();
                } else {
                    setDirectoryCapabilities(null);
                }
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
                setDirectoryCapabilities(data.capabilities ?? null);
                setDirectoryTotal(data.total);
                return;
            }

            setUsers([]);
            resetDirectoryData();
            setDirectoryCapabilities(null);
        } catch (error) {
            logError('Failed to fetch users.', error);
            setUsers([]);
            resetDirectoryData();
            setDirectoryCapabilities(null);
            setLoadErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setIsLoading(false);
        }
    }, [
        directoryPage,
        fetchDirectoryCapabilities,
        filters.roleFilter,
        filters.searchTerm,
        loadDirectoryCapabilities,
        pageMode,
        resetDirectoryData,
    ]);

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
        directoryCapabilities,
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
