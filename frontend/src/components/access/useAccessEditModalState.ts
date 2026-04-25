import { useCallback, useEffect, useRef, useState } from 'react';

import { accessApi } from '@/services/accessApi';
import { departmentApi, type DepartmentSummary } from '@/services/departmentApi';
import { logError } from '@/services/logger';
import type { AccessUserRead, RoleWithPermissions } from '@/types/access';

import {
    type AccessEditCapabilities,
    type AccessEditSelection,
    filterEditableRoles,
    selectionFromUser,
} from './accessEditModalLogic';

interface UseAccessEditModalStateArgs {
    isOpen: boolean;
    user: AccessUserRead | null;
    capabilities: AccessEditCapabilities;
}

export function useAccessEditModalState({ isOpen, user, capabilities }: UseAccessEditModalStateArgs) {
    const initTimerRef = useRef<number | null>(null);
    const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
    const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
    const [allUsers, setAllUsers] = useState<AccessUserRead[]>([]);
    const [selection, setSelection] = useState<AccessEditSelection | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);

    const clearInitTimer = useCallback(() => {
        if (initTimerRef.current !== null) {
            window.clearTimeout(initTimerRef.current);
            initTimerRef.current = null;
        }
    }, []);

    const markInitializedSoon = useCallback(() => {
        clearInitTimer();
        initTimerRef.current = window.setTimeout(() => {
            setIsInitialized(true);
            initTimerRef.current = null;
        }, 100);
    }, [clearInitTimer]);

    const loadData = useCallback(async (activeUser: AccessUserRead) => {
        try {
            const rolesData = await accessApi.listAccessRoles();
            const [deptsData, usersData] = capabilities.canEditBusinessFields
                ? await Promise.all([
                    departmentApi.getDepartments(),
                    accessApi.listAccessUsers(),
                ])
                : [[], []];
            setRoles(filterEditableRoles(rolesData, capabilities.canEditPlatformFields));
            setDepartments(deptsData);
            setAllUsers(usersData.filter((candidate) => candidate.is_active && candidate.id !== activeUser.id));
            markInitializedSoon();
        } catch (err) {
            logError('Failed to load data:', err);
            setLoadErrorKey('errorKeys.request_failed');
            setIsInitialized(true);
        }
    }, [capabilities.canEditBusinessFields, capabilities.canEditPlatformFields, markInitializedSoon]);

    useEffect(() => {
        if (!isOpen || !user) {
            clearInitTimer();
            return;
        }

        setIsInitialized(false);
        setLoadErrorKey(null);
        setSelection(selectionFromUser(user));
        void loadData(user);

        return clearInitTimer;
    }, [clearInitTimer, isOpen, loadData, user]);

    return {
        roles,
        departments,
        allUsers,
        selection,
        setSelection,
        isInitialized,
        loadErrorKey,
    };
}
