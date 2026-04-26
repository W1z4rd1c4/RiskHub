import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { accessApi } from '@/services/accessApi';
import { apiClient } from '@/services/apiClient';
import { departmentApi, type DepartmentSummary } from '@/services/departmentApi';
import { logError } from '@/services/logger';
import { userApi } from '@/services/userApi';
import type { RoleWithPermissions } from '@/types/access';
import type { UserCreate } from '@/types/user';

import { selectSafeDefaultRole } from './userNewRoleDefaults';

const EMPTY_USER_CREATE: UserCreate = {
    email: '',
    name: '',
    password: '',
    role_id: 0,
    department_id: null,
    manager_id: null,
    is_active: true,
};

interface UseLocalUserCreateWorkflowOptions {
    enabled: boolean;
    onCreated: () => void;
}

export function useLocalUserCreateWorkflow({
    enabled,
    onCreated,
}: UseLocalUserCreateWorkflowOptions) {
    const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
    const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
    const [formData, setFormData] = useState<UserCreate>(EMPTY_USER_CREATE);
    const [isLoading, setIsLoading] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    const fetchRoles = useCallback(async () => {
        try {
            const data = await accessApi.listAccessRoles();
            setRoles(data);

            const defaultRole = selectSafeDefaultRole(data);
            if (defaultRole) {
                setFormData((previous) => ({ ...previous, role_id: defaultRole.id }));
            }
        } catch (error) {
            logError('Failed to fetch roles:', error);
        }
    }, []);

    const fetchDepartments = useCallback(async () => {
        try {
            const data = await departmentApi.getDepartments();
            setDepartments(data);
        } catch (error) {
            logError('Failed to fetch departments:', error);
        }
    }, []);

    useEffect(() => {
        if (!enabled) return;
        void fetchDepartments();
        void fetchRoles();
    }, [enabled, fetchDepartments, fetchRoles]);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setIsLoading(true);
        setErrorKey(null);

        try {
            await userApi.createUser(formData);
            onCreated();
        } catch (error: unknown) {
            setErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setIsLoading(false);
        }
    };

    return {
        departments,
        errorKey,
        formData,
        handleSubmit,
        isLoading,
        roles,
        setFormData,
    };
}
