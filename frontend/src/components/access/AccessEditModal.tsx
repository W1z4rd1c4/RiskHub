/**
 * AccessEditModal component for editing user access settings.
 * Backend authorization splits platform identity/Admin-role changes from
 * CRO-owned business access changes.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

import { NativeUserLifecyclePanel } from '@/pages/users/NativeUserLifecyclePanel';
import { getSessionOwnershipSnapshot, isSessionOwnershipCurrent } from '@/services/session';
import { DialogShell } from '@/components/DialogShell';
import { useTranslation } from '@/i18n/hooks';
import { apiClient, ApiClientError } from '@/services/apiClient';
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
    onSaved: (user: AccessUserRead) => void;
    nativeLifecycle?: boolean;
    onRefresh?: () => void;
}

export function AccessEditModal({ isOpen, onClose, user, onSaved, nativeLifecycle = false, onRefresh = () => undefined }: AccessEditModalProps) {
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

    const [lifecycleBusy, setLifecycleBusy] = useState(false);
    const flight = useRef(false);
    const [unknownOutcome, setUnknownOutcome] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const busy = isSubmitting || lifecycleBusy;
    const close = useCallback(() => { if (!flight.current && !lifecycleBusy) onClose(); }, [lifecycleBusy, onClose]);
    const hasChanges = Boolean(user && selection && accessEditHasChanges(user, selection, capabilities));
    const visibleErrorKey = errorKey ?? loadErrorKey;

    useEffect(() => {
        if (!isOpen || !user?.id) return;
        setErrorKey(null);
        setErrorMessage(null);
        setUnknownOutcome(false);
        setIsSubmitting(false);
    }, [isOpen, user?.id]);

    const handleSubmit = async () => {
        if (!user || !selection || flight.current || lifecycleBusy || loadErrorKey || unknownOutcome) return;

        if (!hasChanges) {
            onClose();
            return;
        }

        const owner = getSessionOwnershipSnapshot();
        flight.current = true;
        setIsSubmitting(true);
        setErrorKey(null);
        setErrorMessage(null);

        try {
            const updated = await accessApi.updateAccessUser(user.id, buildAccessUserUpdate(user, selection, capabilities));
            if (!isSessionOwnershipCurrent(owner)) return;
            onSaved(updated);
            onClose();
        } catch (err: unknown) {
            if (!isSessionOwnershipCurrent(owner)) return;
            logError('Failed to update user access:', err);
            if (!(err instanceof ApiClientError) || !err.status || err.status >= 500 || err.status === 200) setUnknownOutcome(true);
            if (err instanceof ApiClientError && (err.status === 403 || err.status === 409)) onRefresh();
            const messageKey = apiClient.toUiMessageKey(err);
            setErrorKey(messageKey);
            setErrorMessage(
                messageKey === 'errorKeys.request_failed' || messageKey === 'errorKeys.unknown'
                    ? apiClient.getRawErrorMessage(err) ?? null
                    : null,
            );
        } finally {
            flight.current = false;
            setIsSubmitting(false);
        }
    };

    if (!user || typeof document === 'undefined') return null;

    return (
        <DialogShell
            isOpen={isOpen}
            onClose={close}
            closeDisabled={busy}
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
                onClose={close}
            />

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {!isInitialized || !selection ? (
                    <AccessEditLoading label={t('loading.generic')} />
                ) : (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        data-testid="access-edit-ready"
                        className="space-y-6"
                    >
                        <fieldset disabled={busy}><AccessEditFormSections
                            capabilities={capabilities}
                            roles={roles}
                            departments={departments}
                            allUsers={allUsers}
                            selection={selection}
                            setSelection={setSelection}
                            t={t}
                        /></fieldset>

                    </motion.div>
                )}
                {isOpen && nativeLifecycle && <NativeUserLifecyclePanel key={user.id} user={user} onBusy={setLifecycleBusy} onCommitted={onSaved} onRefresh={onRefresh} />}
            </div>

            {unknownOutcome && <p role="alert" className="p-4">{t('native_users.unknown_action', { ns: 'admin' })}</p>}
            <AccessEditFooter
                hasChanges={hasChanges}
                isSubmitting={busy}
                isInitialized={isInitialized && !loadErrorKey && !unknownOutcome}
                errorKey={visibleErrorKey}
                errorMessage={errorMessage}
                onClose={close}
                onSubmit={handleSubmit}
                t={t}
            />
        </DialogShell>
    );
}
