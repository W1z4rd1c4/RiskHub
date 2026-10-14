import { useLayoutEffect, useMemo, useRef } from 'react';

import { getSessionOwnershipSnapshot, getSessionSnapshot, isSessionOwnershipCurrent, useSessionSnapshot } from '@/services/session';

/** A committed owner generation, including A → B → A and unmount. */
export function useMutationOwner(ownerKey: string | number | boolean | undefined) {
    const epoch = useMemo(() => ({ ownerKey }), [ownerKey]);
    const current = useRef<typeof epoch | null>(null);
    useLayoutEffect(() => {
        current.current = epoch;
        return () => { if (current.current === epoch) current.current = null; };
    }, [epoch]);
    return useMemo(() => ({
        epoch,
        capture: () => () => current.current === epoch,
    }), [epoch]);
}

/** Session generations revoke mutations; same-session token refresh preserves them. */
export function useSessionMutationOwner(ownerKey: string) {
    const session = useSessionSnapshot();
    const { generation, principalId } = getSessionOwnershipSnapshot();
    const owner = useMutationOwner(JSON.stringify([
        ownerKey, generation, principalId, session.bootstrapStatus, session.logoutPending,
    ]));
    return useMemo(() => ({
        epoch: owner.epoch,
        capture: () => {
            const ownsRoute = owner.capture();
            const capturedSession = { generation, principalId };
            return () => {
                const current = getSessionSnapshot();
                return ownsRoute() && isSessionOwnershipCurrent(capturedSession)
                    && current.bootstrapStatus === 'authenticated' && current.user !== null
                    && current.token !== null && !current.logoutPending;
            };
        },
    }), [generation, owner, principalId]);
}
