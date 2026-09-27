import { useEffect, useRef, useState } from 'react';

import { resolveCapabilityFlag } from '@/lib/capabilities';
import { ApiClientError } from '@/services/apiClient';
import { kriApi } from '@/services/kriApi';
import {
    getSessionOwnershipSnapshot, getSessionSnapshot, isSessionOwnershipCurrent,
    subscribeSessionSnapshot, useSessionSnapshot,
} from '@/services/session';
import type { KeyRiskIndicator } from '@/types/kri';

type RestoreOutcome = 'idle' | 'pending' | 'success' | 'rejected' | 'unknown' | 'denied' | 'archived';

interface RestoreOptions {
    resourceId: number | null;
    kri: KeyRiskIndicator | null;
    setResource: (resource: KeyRiskIndicator | null) => void;
    refresh: () => Promise<{ data?: KeyRiskIndicator | null; isError: boolean }>;
}

// These responses reject the request before the restore boundary. A timeout, malformed
// success payload, or 5xx can follow a committed write and must be reconciled by a read.
function isDefiniteRejection(error: unknown): error is ApiClientError {
    return error instanceof ApiClientError
        && [400, 401, 403, 404, 409, 422, 429].includes(error.status ?? 0);
}

export function useKriRestore({ kri, resourceId, setResource, refresh }: RestoreOptions) {
    const session = useSessionSnapshot();
    const [outcome, setOutcome] = useState<RestoreOutcome>('idle');
    const [isReconciling, setIsReconciling] = useState(false);
    const [reconciliationFailed, setReconciliationFailed] = useState(false);
    const busyRef = useRef(false);
    const ownerRef = useRef<number | null>(resourceId);
    ownerRef.current = resourceId;
    const generationRef = useRef(0);
    const activeSession = session.bootstrapStatus === 'authenticated' && session.user !== null && !session.logoutPending;

    useEffect(() => {
        ownerRef.current = resourceId;
        let previous = getSessionSnapshot();
        let previousOwner = getSessionOwnershipSnapshot();
        const unsubscribe = subscribeSessionSnapshot(() => {
            const next = getSessionSnapshot();
            if (!isSessionOwnershipCurrent(previousOwner)
                || next.user?.id !== previous.user?.id
                || next.bootstrapStatus !== previous.bootstrapStatus
                || next.logoutPending !== previous.logoutPending) {
                generationRef.current += 1;
                busyRef.current = false;
                setOutcome('idle');
                setIsReconciling(false);
                setReconciliationFailed(false);
            }
            previous = next;
            previousOwner = getSessionOwnershipSnapshot();
        });
        return () => {
            generationRef.current += 1;
            ownerRef.current = null;
            unsubscribe();
        };
    }, [resourceId]);

    const canRestore = activeSession && !!kri?.is_archived
        && resolveCapabilityFlag(kri.capabilities, 'can_restore');
    const canSubmit = canRestore && ['idle', 'rejected', 'archived'].includes(outcome);

    const captureRestoreContext = () => {
        const ownerId = kri?.id;
        const generation = generationRef.current;
        const sessionOwner = getSessionOwnershipSnapshot();
        return () => {
            const current = getSessionSnapshot();
            return ownerId !== undefined && ownerRef.current === ownerId
                && generationRef.current === generation && isSessionOwnershipCurrent(sessionOwner)
                && current.bootstrapStatus === 'authenticated' && !current.logoutPending;
        };
    };

    const restore = async () => {
        if (!kri || !canSubmit || busyRef.current) return;
        const ownerId = kri.id;
        const isCurrentRestoreContext = captureRestoreContext();
        busyRef.current = true;
        setOutcome('pending');
        try {
            const restored = await kriApi.restoreKRI(ownerId);
            if (!isCurrentRestoreContext()) return;
            // The existing endpoint returns the complete, actor-scoped KRIResponse
            // after commit, including current capabilities. No follow-up GET is needed.
            if (restored.id !== ownerId || restored.is_archived !== false) {
                setOutcome('unknown');
                return;
            }
            setResource(restored);
            setOutcome('success');
        } catch (error) {
            if (!isCurrentRestoreContext()) return;
            if (isDefiniteRejection(error)) {
                setOutcome([401, 403, 404].includes(error.status ?? 0) ? 'denied' : 'rejected');
            } else {
                setOutcome('unknown');
            }
        } finally {
            if (isCurrentRestoreContext()) busyRef.current = false;
        }
    };

    const reconcile = async () => {
        if (!activeSession || !kri || busyRef.current) return;
        const isCurrentRestoreContext = captureRestoreContext();
        busyRef.current = true;
        setIsReconciling(true);
        setReconciliationFailed(false);
        try {
            const result = await refresh();
            if (!isCurrentRestoreContext()) return;
            if (result.isError || !result.data || result.data.id !== resourceId
                || typeof result.data.is_archived !== 'boolean') {
                setReconciliationFailed(true);
                return;
            }
            setOutcome(result.data.is_archived ? 'archived' : 'success');
        } catch {
            if (isCurrentRestoreContext()) setReconciliationFailed(true);
        } finally {
            if (isCurrentRestoreContext()) {
                busyRef.current = false;
                setIsReconciling(false);
            }
        }
    };

    return { outcome, isReconciling, reconciliationFailed, canRestore, canSubmit, canReconcile: activeSession, restore, reconcile };
}
