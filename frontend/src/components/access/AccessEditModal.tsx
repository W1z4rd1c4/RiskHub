/**
 * AccessEditModal component for editing user access settings.
 * Backend authorization splits platform identity/Admin-role changes from
 * CRO-owned business access changes.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { motion } from 'framer-motion';

import { DialogShell } from '@/components/DialogShell';
import { useTranslation } from '@/i18n/hooks';
import { apiClient } from '@/services/apiClient';
import { accessApi } from '@/services/accessApi';
import { logError } from '@/services/logger';
import type { AccessUserRead } from '@/types/access';

import {
    accessEditHasChanges,
    buildAccessUserUpdate,
    resolveAccessEditCapabilities,
} from './accessEditModalLogic';
import {
    AccessEditFooter,
    AccessEditFormSections,
    AccessEditLoading,
    AccessEditModalHeader,
} from './AccessEditModalSections';
import { useAccessEditModalState } from './useAccessEditModalState';

interface AccessEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: AccessUserRead | null;
    onSaved: () => void;
}

export function AccessEditModal({ isOpen, onClose, user, onSaved }: AccessEditModalProps) {
    const { t } = useTranslation(['common', 'admin', 'errorKeys']);
    const titleId = useId();
    const capabilities = useMemo(
        () => resolveAccessEditCapabilities(user),
        [user],
    );

    const {
        roles,
        departments,
        allUsers,
        selection,
        setSelection,
        isInitialized,
        loadErrorKey,
    } = useAccessEditModalState({ isOpen, user, capabilities });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const hasChanges = Boolean(user && selection && accessEditHasChanges(user, selection, capabilities));
    const visibleErrorKey = errorKey ?? loadErrorKey;

    useEffect(() => {
        if (!isOpen || !user?.id) return;
        setErrorKey(null);
        setErrorMessage(null);
        setIsSubmitting(false);
    }, [isOpen, user?.id]);

    const handleSubmit = async () => {
        if (!user || !selection) return;

        if (!hasChanges) {
            onClose();
            return;
        }

        setIsSubmitting(true);
        setErrorKey(null);
        setErrorMessage(null);

        try {
            await accessApi.updateAccessUser(user.id, buildAccessUserUpdate(user, selection, capabilities));
            onSaved();
            onClose();
        } catch (err: unknown) {
            logError('Failed to update user access:', err);
            const messageKey = apiClient.toUiMessageKey(err);
            setErrorKey(messageKey);
            setErrorMessage(
                messageKey === 'errorKeys.request_failed' || messageKey === 'errorKeys.unknown'
                    ? apiClient.getRawErrorMessage(err) ?? null
                    : null,
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!user || typeof document === 'undefined') return null;

    return (
        <DialogShell
            isOpen={isOpen}
            onClose={onClose}
            titleId={titleId}
            backdropClassName="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            contentClassName="glass-card w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border-white/5"
        >
            {/*
              The visible title is rendered inside AccessEditModalHeader (a shared
              subcomponent we don't own here), so it can't carry the id DialogShell
              needs for aria-labelledby. This visually-hidden heading provides the
              dialog's accessible name using the same i18n key.
            */}
            <h2 id={titleId} className="sr-only">{t('access.modal.title', { ns: 'admin' })}</h2>
            <AccessEditModalHeader
                title={t('access.modal.title', { ns: 'admin' })}
                userName={user.name}
                onClose={onClose}
            />

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {!isInitialized || !selection ? (
                    <AccessEditLoading label={t('loading.generic')} />
                ) : (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-6"
                    >
                        <AccessEditFormSections
                            capabilities={capabilities}
                            roles={roles}
                            departments={departments}
                            allUsers={allUsers}
                            selection={selection}
                            setSelection={setSelection}
                            t={t}
                        />
                    </motion.div>
                )}
            </div>

            <AccessEditFooter
                hasChanges={hasChanges}
                isSubmitting={isSubmitting}
                isInitialized={isInitialized}
                errorKey={visibleErrorKey}
                errorMessage={errorMessage}
                onClose={onClose}
                onSubmit={handleSubmit}
                t={t}
            />
        </DialogShell>
    );
}
