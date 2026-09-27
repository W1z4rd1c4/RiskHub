import { useCallback, useEffect, useRef, useState } from 'react';

import { getSessionOwnershipSnapshot, isSessionOwnershipCurrent } from '@/services/session';
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
    const targetRef = useRef<number | null>(null);
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

    const loadData = useCallback(async (activeUser: AccessUserRead, signal: AbortSignal) => {
        const owner = getSessionOwnershipSnapshot();
        const current = () => !signal.aborted && isSessionOwnershipCurrent(owner);
        try {
            const rolesData = await accessApi.listAccessRoles({ signal });
            const [deptsData, usersData] = capabilities.canEditBusinessFields
                ? await Promise.all([
                    departmentApi.getDepartments({ signal }),
                    accessApi.listAccessUsers(undefined, { signal }),
                ])
                : [[], []];
            if (!current()) return;
            setRoles(filterEditableRoles(rolesData, capabilities.canEditPlatformFields));
            setDepartments(deptsData);
            setAllUsers(usersData.filter((candidate) => candidate.is_active && candidate.id !== activeUser.id));
            markInitializedSoon();
        } catch (err) {
            if (!current()) return;
            logError('Failed to load data:', err);
            setLoadErrorKey('errorKeys.request_failed');
            setIsInitialized(true);
        }
    }, [capabilities.canEditBusinessFields, capabilities.canEditPlatformFields, markInitializedSoon]);

    useEffect(() => {
        if (!isOpen || !user) {
            clearInitTimer();
            targetRef.current = null;
            return;
        }

        const controller = new AbortController();
        setIsInitialized(false);
        setLoadErrorKey(null);
        const sameTarget = targetRef.current === user.id;
        setSelection((previous) => previous && sameTarget ? previous : selectionFromUser(user));
        targetRef.current = user.id;
        void loadData(user, controller.signal);

        return () => { controller.abort(); clearInitTimer(); };
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
