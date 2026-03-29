import { useState, useMemo } from 'react';
import type { AccessUserRead } from '@/types/access';
import type { UserDirectoryEntry } from '@/types/user';

// Permission filter options
export const permissionResources = [
    { value: 'all', labelKey: 'admin:access.all_permissions' },
    { value: 'risks', labelKey: 'admin:access.resources.risks' },
    { value: 'controls', labelKey: 'admin:access.resources.controls' },
    { value: 'users', labelKey: 'admin:access.resources.users' },
    { value: 'reports', labelKey: 'admin:access.resources.reports' },
    { value: 'approvals', labelKey: 'admin:access.resources.approvals' },
    { value: 'departments', labelKey: 'admin:access.resources.departments' },
];

export const permissionActions = [
    { value: 'all', labelKey: 'admin:access.any_action' },
    { value: 'read', labelKey: 'admin:access.actions.can_view' },
    { value: 'write', labelKey: 'admin:access.actions.can_edit' },
    { value: 'delete', labelKey: 'admin:access.actions.can_delete' },
];

// Check if user has specific permission
export function hasPermission(perms: string[], resource: string, action: string): boolean {
    if (resource === 'all' && action === 'all') return true;
    return perms.some(p => {
        const [r, a] = p.split(':');
        const matchesResource = resource === 'all' || r === resource;
        const matchesAction = action === 'all' || a === action;
        return matchesResource && matchesAction;
    });
}

export interface UsersPageFiltersState {
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    roleFilter: string;
    setRoleFilter: (role: string) => void;
    scopeFilter: string;
    setScopeFilter: (scope: string) => void;
    permResourceFilter: string;
    setPermResourceFilter: (resource: string) => void;
    permActionFilter: string;
    setPermActionFilter: (action: string) => void;
    hasPermFilters: boolean;
    resetPermissionFilters: () => void;
    filteredAccessUsers: AccessUserRead[];
    filteredDirectoryUsers: UserDirectoryEntry[];
}

interface UseUsersPageFiltersProps {
    accessUsers: AccessUserRead[];
    directoryUsers: UserDirectoryEntry[];
}

export function useUsersPageFilters({
    accessUsers,
    directoryUsers,
}: UseUsersPageFiltersProps): UsersPageFiltersState {
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [scopeFilter, setScopeFilter] = useState('all');
    const [permResourceFilter, setPermResourceFilter] = useState('all');
    const [permActionFilter, setPermActionFilter] = useState('all');

    const hasPermFilters = permResourceFilter !== 'all' || permActionFilter !== 'all';

    const resetPermissionFilters = () => {
        setPermResourceFilter('all');
        setPermActionFilter('all');
    };

    // Filter logic for access mode
    const filteredAccessUsers = useMemo(() => {
        return accessUsers.filter(user => {
            const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                user.email.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesRole = roleFilter === 'all' || user.role.name === roleFilter;
            const matchesScope = scopeFilter === 'all' || user.access_scope === scopeFilter;
            const matchesPerm = hasPermission(user.effective_permissions, permResourceFilter, permActionFilter);
            return matchesSearch && matchesRole && matchesScope && matchesPerm;
        });
    }, [accessUsers, searchTerm, roleFilter, scopeFilter, permResourceFilter, permActionFilter]);

    // Directory mode filtering is handled server-side; keep a stable pass-through list here
    // so the page can drive paginated requests from the same filter state.
    const filteredDirectoryUsers = useMemo(() => {
        return directoryUsers;
    }, [directoryUsers]);

    return {
        searchTerm,
        setSearchTerm,
        roleFilter,
        setRoleFilter,
        scopeFilter,
        setScopeFilter,
        permResourceFilter,
        setPermResourceFilter,
        permActionFilter,
        setPermActionFilter,
        hasPermFilters,
        resetPermissionFilters,
        filteredAccessUsers,
        filteredDirectoryUsers,
    };
}
