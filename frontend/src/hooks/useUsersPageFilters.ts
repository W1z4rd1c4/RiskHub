import { useState, useMemo } from 'react';
import type { AccessUserRead } from '@/types/access';
import type { UserLookup } from '@/types/user';

// Permission filter options
export const permissionResources = [
    { value: 'all', label: 'All Permissions' },
    { value: 'risks', label: '⚠️ Risks' },
    { value: 'controls', label: '🛡️ Controls' },
    { value: 'users', label: '👥 Users' },
    { value: 'reports', label: '📊 Reports' },
    { value: 'approvals', label: '✅ Approvals' },
    { value: 'departments', label: '🏢 Departments' },
];

export const permissionActions = [
    { value: 'all', label: 'Any Action' },
    { value: 'read', label: 'Can View' },
    { value: 'write', label: 'Can Edit' },
    { value: 'delete', label: 'Can Delete' },
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
    filteredDirectoryUsers: UserLookup[];
}

interface UseUsersPageFiltersProps {
    accessUsers: AccessUserRead[];
    directoryUsers: UserLookup[];
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

    // Filter logic for directory mode (read-only, simpler filtering)
    const filteredDirectoryUsers = useMemo(() => {
        return directoryUsers.filter(user => {
            const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                user.email.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesRole = roleFilter === 'all' || user.role_name === roleFilter;
            return matchesSearch && matchesRole;
        });
    }, [directoryUsers, searchTerm, roleFilter]);

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
