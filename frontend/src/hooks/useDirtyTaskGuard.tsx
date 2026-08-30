import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router-dom';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useTranslation } from '@/i18n/hooks';

interface DirtyTaskGuardOptions {
    currentSnapshot: string;
    busy?: boolean;
    enabled?: boolean;
}

export function useDirtyTaskGuard({
    currentSnapshot,
    busy = false,
    enabled = true,
}: DirtyTaskGuardOptions) {
    const { t } = useTranslation('common');
    const currentSnapshotRef = useRef(currentSnapshot);
    const acceptedSnapshotRef = useRef(currentSnapshot);
    const busyRef = useRef(busy);
    const enabledRef = useRef(enabled);
    const acceptanceVersionRef = useRef(0);
    const allowAcceptedNavigationRef = useRef(false);
    const localLeaveRef = useRef<(() => void) | null>(null);
    const [hasLocalLeave, setHasLocalLeave] = useState(false);

    useLayoutEffect(() => {
        currentSnapshotRef.current = currentSnapshot;
        busyRef.current = busy;
        enabledRef.current = enabled;
        if (!busy || !enabled) {
            acceptanceVersionRef.current += 1;
            allowAcceptedNavigationRef.current = false;
        }
        if (!enabled) {
            acceptedSnapshotRef.current = currentSnapshot;
        }
    }, [busy, currentSnapshot, enabled]);

    const isDirty = useCallback(
        () => enabledRef.current && currentSnapshotRef.current !== acceptedSnapshotRef.current,
        [],
    );

    const shouldBlock = useCallback(
        () => {
            if (!enabledRef.current) return false;
            if (!busyRef.current) return isDirty();
            if (!allowAcceptedNavigationRef.current) return true;
            allowAcceptedNavigationRef.current = false;
            return false;
        },
        [isDirty],
    );
    const blocker = useBlocker(shouldBlock);

    useLayoutEffect(() => {
        if (busy && blocker.state === 'blocked') {
            blocker.reset();
        }
    }, [blocker, busy]);

    useBeforeUnload(useCallback((event) => {
        if (!enabledRef.current || (!busyRef.current && !isDirty())) return;
        event.preventDefault();
        event.returnValue = '';
    }, [isDirty]));

    const acceptCurrentSnapshot = useCallback((snapshot?: string) => {
        acceptedSnapshotRef.current = snapshot ?? currentSnapshotRef.current;
        allowAcceptedNavigationRef.current = busyRef.current && enabledRef.current;
        if (!allowAcceptedNavigationRef.current) return;
        const acceptanceVersion = ++acceptanceVersionRef.current;
        queueMicrotask(() => {
            if (acceptanceVersionRef.current === acceptanceVersion) {
                allowAcceptedNavigationRef.current = false;
            }
        });
    }, []);

    const requestLocalLeave = useCallback((leave: () => void) => {
        if (enabledRef.current && busyRef.current) return;
        if (!isDirty()) {
            leave();
            return;
        }
        localLeaveRef.current = leave;
        setHasLocalLeave(true);
    }, [isDirty]);

    const stay = useCallback(() => {
        localLeaveRef.current = null;
        setHasLocalLeave(false);
        if (blocker.state === 'blocked') {
            blocker.reset();
        }
    }, [blocker]);

    const leave = useCallback(() => {
        const localLeave = localLeaveRef.current;
        if (localLeave) {
            localLeaveRef.current = null;
            setHasLocalLeave(false);
            acceptedSnapshotRef.current = currentSnapshotRef.current;
            localLeave();
            return;
        }
        if (blocker.state === 'blocked') {
            blocker.proceed();
        }
    }, [blocker]);

    const confirmationDialog = (
        <ConfirmDialog
            isOpen={!busy && (hasLocalLeave || blocker.state === 'blocked')}
            onClose={stay}
            onConfirm={leave}
            title={t('confirmation.unsaved_title')}
            message={t('confirmation.unsaved_changes')}
            cancelLabel={t('actions.stay')}
            confirmLabel={t('actions.leave')}
            variant="warning"
        />
    );

    return {
        acceptCurrentSnapshot,
        confirmationDialog,
        requestLocalLeave,
    };
}
