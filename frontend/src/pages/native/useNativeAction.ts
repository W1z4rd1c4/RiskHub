import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeAuthError, type NativeErrorKind } from '@/services/nativeAuthApi';
import { clearAuthenticatedSession, getSessionOwnershipSnapshot, isSessionOwnershipCurrent, subscribeSessionSnapshot } from '@/services/session';

/** Restricted authentication work never enters the query cache or survives its owner. */
export function useNativeAction(onInvalidated: () => void = () => undefined) {
    const owner = useRef(getSessionOwnershipSnapshot());
    const completing = useRef(false);
    const flight = useRef<AbortController | null>(null);
    const invalidated = useRef(onInvalidated);
    invalidated.current = onInvalidated;
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<NativeErrorKind | 'expired' | null>(null);
    const cancel = useCallback(() => {
        flight.current?.abort();
        flight.current = null;
        setPending(false);
        setError(null);
    }, []);
    useEffect(() => {
        owner.current = getSessionOwnershipSnapshot();
        const unsubscribe = subscribeSessionSnapshot(() => {
            if (!isSessionOwnershipCurrent(owner.current)) {
                if (completing.current) { owner.current = getSessionOwnershipSnapshot(); return; }
                cancel();
                invalidated.current();
                owner.current = getSessionOwnershipSnapshot();
            }
        });
        return () => { unsubscribe(); flight.current?.abort(); flight.current = null; };
    }, [cancel]);
    const run = async <T,>(
        request: (signal: AbortSignal) => Promise<T>,
        success: (value: T) => void,
        failure?: (kind: NativeErrorKind) => void,
    ) => {
        if (flight.current) return;
        const controller = new AbortController();
        const owner = getSessionOwnershipSnapshot();
        flight.current = controller;
        setPending(true);
        setError(null);
        try {
            const value = await request(controller.signal);
            if (!controller.signal.aborted && isSessionOwnershipCurrent(owner)) success(value);
        } catch (cause) {
            if (!controller.signal.aborted && isSessionOwnershipCurrent(owner)) {
                const kind = cause instanceof NativeAuthError ? cause.kind : 'uncertain';
                setError(kind);
                failure?.(kind);
            }
        } finally {
            if (flight.current === controller) { flight.current = null; setPending(false); }
        }
    };
    // Expected credential completion clears protected state while display-once codes
    // remain in this public flow. Any later owner change still discards the flow.
    const clearSession = () => {
        completing.current = true;
        try { clearAuthenticatedSession({ clearBootstrap: true, clearRefreshHint: true, clearCsrf: true }); }
        finally { completing.current = false; }
    };
    return { pending, error, setError, cancel, run, clearSession };
}
