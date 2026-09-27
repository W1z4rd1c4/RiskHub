import { useCallback, useEffect, useRef, useState } from 'react';

import { resolveCapabilityFlag } from '@/lib/capabilities';
import { ApiClientError } from '@/services/apiClient';
import { logError } from '@/services/logger';

export type CapabilityState = 'loading' | 'allowed' | 'denied' | 'error';
type CreateCapability = 'can_create' | 'can_create_linked_risk' | 'can_create_linked_control' | 'can_create_linked_kri';

interface CreateCapabilityResponse {
    capabilities?: Partial<Record<CreateCapability, boolean>> | null;
}

interface UseCreateCapabilityGateOptions<T> {
    enabled?: boolean;
    load: () => Promise<T>;
    capability?: CreateCapability;
    logMessage: string;
}

export function useCreateCapabilityGate<T extends CreateCapabilityResponse>({
    enabled = true,
    load,
    capability = 'can_create',
    logMessage,
}: UseCreateCapabilityGateOptions<T>) {
    const [attempt, setAttempt] = useState(0);
    const inFlight = useRef(false);
    const [result, setResult] = useState<{
        load: typeof load;
        capability: CreateCapability;
        attempt: number;
        state: CapabilityState;
        data?: T;
    }>();
    // A new route/load must never borrow an allowed result from the previous record,
    // even for the render before the effect begins its new request.
    const current = result?.load === load && result.capability === capability && result.attempt === attempt;
    const state: CapabilityState = !enabled ? 'allowed' : current ? result.state : 'loading';

    useEffect(() => {
        if (!enabled) {
            setResult(undefined);
            inFlight.current = false;
            return;
        }
        let active = true;
        inFlight.current = true;
        const check = async () => {
            try {
                const data = await load();
                if (!active) return;
                setResult({ load, capability, attempt, data,
                    state: resolveCapabilityFlag(data.capabilities, capability) ? 'allowed' : 'denied' });
            } catch (error) {
                if (!active) return;
                logError(logMessage, error);
                // Session loss is handled centrally by ApiClient. These statuses stay
                // fail-closed and share one non-leaky presentation; no raw error detail.
                const denied = error instanceof ApiClientError && [401, 403, 404].includes(error.status ?? 0);
                setResult({ load, capability, attempt, state: denied ? 'denied' : 'error' });
            } finally {
                if (active) inFlight.current = false;
            }
        };
        void check();
        return () => { active = false; };
    }, [enabled, load, capability, logMessage, attempt]);

    const retry = useCallback(() => {
        if (state !== 'error' || inFlight.current) return;
        inFlight.current = true;
        setAttempt(value => value + 1);
    }, [state]);

    return { state, retry, data: enabled && current ? result.data : undefined };
}

export function combineCapabilityGateStates(states: CapabilityState[]): CapabilityState {
    // An authoritative denial wins. Otherwise await pending siblings before offering
    // a retry, so a later denial cannot be obscured by a transient failure.
    if (states.includes('denied')) return 'denied';
    if (states.includes('loading')) return 'loading';
    if (states.includes('error')) return 'error';
    return 'allowed';
}
