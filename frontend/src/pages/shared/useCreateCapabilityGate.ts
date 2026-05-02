import { useEffect, useState } from 'react';

import { logError } from '@/services/logger';

type CapabilityState = 'loading' | 'allowed' | 'denied';

interface CollectionCapabilityResponse {
    capabilities?: Record<string, boolean> | null;
}

interface UseCreateCapabilityGateOptions {
    enabled?: boolean;
    load: () => Promise<CollectionCapabilityResponse>;
    logMessage: string;
}

export function useCreateCapabilityGate({
    enabled = true,
    load,
    logMessage,
}: UseCreateCapabilityGateOptions): CapabilityState {
    const [state, setState] = useState<CapabilityState>(enabled ? 'loading' : 'allowed');

    useEffect(() => {
        if (!enabled) {
            setState('allowed');
            return undefined;
        }

        let isMounted = true;

        const loadCapabilities = async () => {
            setState('loading');
            try {
                const response = await load();
                if (!isMounted) return;
                setState(response.capabilities?.can_create === true ? 'allowed' : 'denied');
            } catch (error) {
                logError(logMessage, error);
                if (isMounted) {
                    setState('denied');
                }
            }
        };

        void loadCapabilities();

        return () => {
            isMounted = false;
        };
    }, [enabled, load, logMessage]);

    return state;
}

export function combineCapabilityGateStates(states: CapabilityState[]): CapabilityState {
    if (states.includes('loading')) {
        return 'loading';
    }
    if (states.every((state) => state === 'allowed')) {
        return 'allowed';
    }
    return 'denied';
}
