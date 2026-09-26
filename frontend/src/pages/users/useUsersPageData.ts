import { useCallback, useEffect, useRef, useState } from 'react';

import { getSessionOwnershipSnapshot, isSessionOwnershipCurrent } from '@/services/session';
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
    departmentId?: number;
    loadDirectoryCapabilities: boolean;
    pageMode: UsersPageMode;
}

export function useUsersPageData({
    currentUserLoaded,
    departmentId,
    loadDirectoryCapabilities,
    pageMode,
}: UseUsersPageDataOptions) {
    const request = useRef<AbortController | null>(null);
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

    const query = filters.searchTerm.trim().toLowerCase();
    const fetchUsers = useCallback(async () => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        const owner = getSessionOwnershipSnapshot();
        const current = () => !controller.signal.aborted && isSessionOwnershipCurrent(owner);
        try {
            setIsLoading(true);
            setLoadErrorKey(null);
            if (pageMode === 'access' || pageMode === 'department-access') {
                const data = pageMode === 'access'
                    ? await accessApi.listAccessUsers(undefined, { signal: controller.signal })
                    : await accessApi.listDepartmentAccessUsers(departmentId);
                if (!current()) return;
                setUsers(data);
                resetDirectoryData();
                if (loadDirectoryCapabilities) {
                    try {
                        const directory = await userDirectoryApi.listDirectoryUsers({ skip: 0, limit: 1 }, { signal: controller.signal });
                        if (!current()) return;
                        setDirectoryCapabilities(directory.capabilities ?? null);
                        setDirectoryAvailableRoles(directory.available_roles ?? []);
                    } catch {
                        if (current()) { setDirectoryCapabilities(null); setDirectoryAvailableRoles([]); }
                    }
                } else setDirectoryCapabilities(null);
                return;
            }
            if (pageMode === 'directory') {
                const data = await userDirectoryApi.listDirectoryUsers({ q: query || undefined,
                    role_name: filters.roleFilter !== 'all' ? filters.roleFilter : undefined,
                    skip: (directoryPage - 1) * DIRECTORY_PAGE_SIZE, limit: DIRECTORY_PAGE_SIZE,
                }, { signal: controller.signal });
                if (!current()) return;
                setUsers([]); setDirectoryUsers(data.items);
                setDirectoryAvailableRoles(data.available_roles ?? []);
                setDirectoryCapabilities(data.capabilities ?? null); setDirectoryTotal(data.total);
                return;
            }
            setUsers([]); resetDirectoryData(); setDirectoryCapabilities(null);
        } catch (error) {
            if (!current()) return;
            logError('Failed to fetch users.', error);
            // Retain committed rows separately from the reload warning.
            setLoadErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            if (current()) setIsLoading(false);
        }
    }, [directoryPage, departmentId, filters.roleFilter, query, loadDirectoryCapabilities, pageMode, resetDirectoryData]);

    const applyCommittedUser = useCallback((updated: AccessUserRead) => {
        request.current?.abort();
        setUsers((previous) => previous.map((user) => user.id === updated.id ? updated : user));
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (currentUserLoaded && pageMode !== 'forbidden') {
            void fetchUsers();
        }
        return () => request.current?.abort();
    }, [currentUserLoaded, fetchUsers, pageMode]);

    useEffect(() => {
        if (isDirectoryMode) {
            setDirectoryPage(1);
        }
    }, [filters.roleFilter, query, isDirectoryMode]);

    return {
        directoryAvailableRoles,
        directoryCapabilities,
        directoryPage,
        directoryTotal,
        directoryUsers,
        fetchUsers,
        applyCommittedUser,
        filters,
        isLoading,
        loadErrorKey,
        setDirectoryPage,
        users,
    };
}
