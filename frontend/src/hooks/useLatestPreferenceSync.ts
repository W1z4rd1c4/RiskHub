import { useCallback, useEffect, useRef, useState } from 'react';

export type PreferenceSyncStatus = 'idle' | 'saving' | 'saved' | 'unsynced';

interface LatestPreferenceSyncOptions<T> {
    initialValue: T;
    save: (value: T, signal: AbortSignal) => Promise<void>;
    applyLocal: (value: T) => void | Promise<void>;
    serializeLocalApplication?: boolean;
}

export function useLatestPreferenceSync<T>({
    initialValue,
    save,
    applyLocal,
    serializeLocalApplication = false,
}: LatestPreferenceSyncOptions<T>) {
    const [status, setStatus] = useState<PreferenceSyncStatus>('idle');
    const desiredValueRef = useRef(initialValue);
    const confirmedValueRef = useRef(initialValue);
    const runningRef = useRef(false);
    const mountedRef = useRef(true);
    const controllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            controllerRef.current?.abort();
        };
    }, []);

    const setMountedStatus = useCallback((next: PreferenceSyncStatus) => {
        if (mountedRef.current) {
            setStatus(next);
        }
    }, []);

    const drain = useCallback(async () => {
        if (runningRef.current) return;
        runningRef.current = true;

        while (mountedRef.current) {
            const target = desiredValueRef.current;
            const controller = new AbortController();
            controllerRef.current = controller;
            setMountedStatus('saving');

            try {
                if (serializeLocalApplication) {
                    await applyLocal(target);
                    if (!mountedRef.current || controller.signal.aborted) break;
                    if (!Object.is(desiredValueRef.current, target)) {
                        continue;
                    }
                }
                await save(target, controller.signal);
                if (!mountedRef.current || controller.signal.aborted) break;
                confirmedValueRef.current = target;
            } catch {
                if (!mountedRef.current || controller.signal.aborted) break;
                if (!Object.is(desiredValueRef.current, target)) {
                    continue;
                }
                setMountedStatus('unsynced');
                break;
            }

            if (!Object.is(desiredValueRef.current, target)) {
                continue;
            }

            setMountedStatus('saved');
            break;
        }

        controllerRef.current = null;
        runningRef.current = false;
    }, [applyLocal, save, serializeLocalApplication, setMountedStatus]);

    const sync = useCallback((value: T) => {
        desiredValueRef.current = value;
        if (!serializeLocalApplication) {
            void applyLocal(value);
        }
        setMountedStatus('saving');
        void drain();
    }, [applyLocal, drain, serializeLocalApplication, setMountedStatus]);

    const retry = useCallback(() => {
        void drain();
    }, [drain]);

    const revert = useCallback(() => {
        const confirmed = confirmedValueRef.current;
        desiredValueRef.current = confirmed;
        void Promise.resolve(applyLocal(confirmed))
            .then(() => setMountedStatus('idle'))
            .catch(() => setMountedStatus('unsynced'));
    }, [applyLocal, setMountedStatus]);

    const acknowledgeExternalValue = useCallback((value: T) => {
        if (runningRef.current) return;
        desiredValueRef.current = value;
        confirmedValueRef.current = value;
    }, []);

    return {
        status,
        sync,
        retry,
        revert,
        acknowledgeExternalValue,
    };
}
