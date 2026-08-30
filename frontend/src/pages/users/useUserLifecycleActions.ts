import { useRef, useState } from 'react';

import { adminApi } from '@/services/adminApi';
import { apiClient } from '@/services/apiClient';
import { logError } from '@/services/logger';
import { userApi } from '@/services/userApi';
import type { AccessUserRead } from '@/types/access';

type Translate = (key: string, options?: Record<string, unknown>) => string;

interface UseUserLifecycleActionsOptions {
    refreshUsers: () => Promise<void>;
    setOutcome: (outcome: { kind: 'status' | 'alert'; message: string } | null) => void;
    t: Translate;
}

export function useUserLifecycleActions({
    refreshUsers,
    setOutcome,
    t,
}: UseUserLifecycleActionsOptions) {
    const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
    const [userToToggle, setUserToToggle] = useState<AccessUserRead | null>(null);
    const [isToggling, setIsToggling] = useState(false);
    const [breakGlassUser, setBreakGlassUser] = useState<AccessUserRead | null>(null);
    const [breakGlassReason, setBreakGlassReason] = useState('');
    const [breakGlassHours, setBreakGlassHours] = useState<number | ''>(4);
    const [breakGlassError, setBreakGlassError] = useState<string | null>(null);
    const [isBreakGlassSubmitting, setIsBreakGlassSubmitting] = useState(false);
    const isBreakGlassSubmittingRef = useRef(false);

    const handleToggleClick = (user: AccessUserRead) => {
        setOutcome(null);
        setUserToToggle(user);
        setConfirmDialogOpen(true);
    };

    const handleToggleClose = () => {
        setConfirmDialogOpen(false);
        setUserToToggle(null);
    };

    const toggleUserStatus = async () => {
        if (!userToToggle) return;

        try {
            setIsToggling(true);
            await userApi.updateUser(userToToggle.id, { is_active: !userToToggle.is_active });
            await refreshUsers();
            setOutcome({
                kind: 'status',
                message: t('users.user_status_update_success', {
                    ns: 'admin',
                    name: userToToggle.name,
                    status: userToToggle.is_active
                        ? t('access.status.inactive', { ns: 'admin' })
                        : t('access.status.active', { ns: 'admin' }),
                }),
            });
        } catch (error) {
            logError('Failed to update user status.', error);
            setOutcome({
                kind: 'alert',
                message: apiClient.getRawErrorMessage(error)
                    ?? t('users.user_status_update_failed', { ns: 'admin' }),
            });
        } finally {
            setIsToggling(false);
            setConfirmDialogOpen(false);
            setUserToToggle(null);
        }
    };

    const handleBreakGlassOpen = (user: AccessUserRead) => {
        setOutcome(null);
        setBreakGlassUser(user);
        setBreakGlassReason('');
        setBreakGlassHours(4);
        setBreakGlassError(null);
    };

    const handleBreakGlassClose = () => {
        if (isBreakGlassSubmitting) return;
        setBreakGlassUser(null);
        setBreakGlassReason('');
        setBreakGlassHours(4);
        setBreakGlassError(null);
    };

    const handleBreakGlassSubmit = async () => {
        if (
            isBreakGlassSubmittingRef.current
            || !breakGlassUser
            || !breakGlassReason.trim()
            || breakGlassHours === ''
        ) return;

        isBreakGlassSubmittingRef.current = true;
        try {
            setBreakGlassError(null);
            setIsBreakGlassSubmitting(true);
            await adminApi.breakGlassEnableDirectoryUser(breakGlassUser.id, {
                reason: breakGlassReason.trim(),
                expires_in_hours: breakGlassHours,
            });
            setOutcome({
                kind: 'status',
                message: t('users.break_glass_success', {
                    ns: 'admin',
                    name: breakGlassUser.name,
                }),
            });
            setBreakGlassUser(null);
            setBreakGlassReason('');
            setBreakGlassHours(4);
            setBreakGlassError(null);
            await refreshUsers();
        } catch (error) {
            logError('Break-glass enable failed.', error);
            setBreakGlassError(
                apiClient.getRawErrorMessage(error)
                    ?? t('users.break_glass_failed', { ns: 'admin' }),
            );
        } finally {
            isBreakGlassSubmittingRef.current = false;
            setIsBreakGlassSubmitting(false);
        }
    };

    return {
        breakGlassHours,
        breakGlassError,
        breakGlassReason,
        breakGlassUser,
        confirmDialogOpen,
        handleBreakGlassClose,
        handleBreakGlassOpen,
        handleBreakGlassSubmit,
        handleToggleClose,
        handleToggleClick,
        isBreakGlassSubmitting,
        isToggling,
        setBreakGlassHours,
        setBreakGlassReason,
        toggleUserStatus,
        userToToggle,
    };
}
