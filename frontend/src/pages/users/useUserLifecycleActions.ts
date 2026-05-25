import { useState } from 'react';

import { adminApi } from '@/services/adminApi';
import { apiClient } from '@/services/apiClient';
import { logError } from '@/services/logger';
import { userApi } from '@/services/userApi';
import type { AccessUserRead } from '@/types/access';

type Translate = (key: string, options?: Record<string, unknown>) => string;

interface UseUserLifecycleActionsOptions {
    refreshUsers: () => Promise<void>;
    setDirectoryMessage: (message: string | null) => void;
    t: Translate;
}

export function useUserLifecycleActions({
    refreshUsers,
    setDirectoryMessage,
    t,
}: UseUserLifecycleActionsOptions) {
    const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
    const [userToToggle, setUserToToggle] = useState<AccessUserRead | null>(null);
    const [isToggling, setIsToggling] = useState(false);
    const [breakGlassUser, setBreakGlassUser] = useState<AccessUserRead | null>(null);
    const [breakGlassReason, setBreakGlassReason] = useState('');
    const [breakGlassHours, setBreakGlassHours] = useState<number | ''>(4);
    const [isBreakGlassSubmitting, setIsBreakGlassSubmitting] = useState(false);

    const handleToggleClick = (user: AccessUserRead) => {
        setDirectoryMessage(null);
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
        } catch (error) {
            logError('Failed to update user status.', error);
            setDirectoryMessage(
                apiClient.getRawErrorMessage(error)
                ?? t('users.user_status_update_failed', { ns: 'admin' })
            );
        } finally {
            setIsToggling(false);
            setConfirmDialogOpen(false);
            setUserToToggle(null);
        }
    };

    const handleBreakGlassOpen = (user: AccessUserRead) => {
        setDirectoryMessage(null);
        setBreakGlassUser(user);
        setBreakGlassReason('');
        setBreakGlassHours(4);
    };

    const handleBreakGlassClose = () => {
        if (isBreakGlassSubmitting) return;
        setBreakGlassUser(null);
        setBreakGlassReason('');
        setBreakGlassHours(4);
    };

    const handleBreakGlassSubmit = async () => {
        if (!breakGlassUser || !breakGlassReason.trim() || breakGlassHours === '') return;
        try {
            setIsBreakGlassSubmitting(true);
            await adminApi.breakGlassEnableDirectoryUser(breakGlassUser.id, {
                reason: breakGlassReason.trim(),
                expires_in_hours: breakGlassHours,
            });
            setDirectoryMessage(
                t('users.break_glass_success', {
                    ns: 'admin',
                    name: breakGlassUser.name,
                })
            );
            setBreakGlassUser(null);
            setBreakGlassReason('');
            setBreakGlassHours(4);
            await refreshUsers();
        } catch (error) {
            logError('Break-glass enable failed.', error);
            setDirectoryMessage(
                apiClient.getRawErrorMessage(error)
                ?? t('users.break_glass_failed', { ns: 'admin' })
            );
        } finally {
            setIsBreakGlassSubmitting(false);
        }
    };

    return {
        breakGlassHours,
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
