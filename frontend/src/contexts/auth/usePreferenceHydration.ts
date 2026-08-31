import { useCallback, useEffect, useRef, useState } from 'react';
import { logError } from '@/services/logger';
import { isAbortError } from '@/services/api/requestRuntime';
import { getSessionOwnershipSnapshot, useSessionSnapshot } from '@/services/session';
import { syncPreferencesFromServer } from '@/utils/userSettingsStorage';

export function usePreferenceHydration(initialReady: boolean) {
    const principalId = useSessionSnapshot().user?.id ?? null;
    const [isPreferencesHydrated, setIsPreferencesHydrated] = useState(initialReady);
    const hydrationControllerRef = useRef<AbortController | null>(null);
    const hydrationPrincipalRef = useRef<number | null>(null);

    useEffect(() => {
        if (
            hydrationControllerRef.current
            && hydrationPrincipalRef.current !== principalId
        ) {
            hydrationControllerRef.current.abort();
            hydrationControllerRef.current = null;
            hydrationPrincipalRef.current = null;
        }
        if (principalId === null) {
            setIsPreferencesHydrated(true);
        }
    }, [principalId]);

    useEffect(() => {
        return () => {
            hydrationControllerRef.current?.abort();
            hydrationControllerRef.current = null;
            hydrationPrincipalRef.current = null;
        };
    }, []);

    const markPreferencesReady = useCallback((ready: boolean) => {
        setIsPreferencesHydrated(ready);
    }, []);

    const hydratePreferences = useCallback(async () => {
        hydrationControllerRef.current?.abort();
        const controller = new AbortController();
        hydrationControllerRef.current = controller;
        hydrationPrincipalRef.current = getSessionOwnershipSnapshot().principalId;
        markPreferencesReady(false);

        try {
            await syncPreferencesFromServer(controller.signal);
        } catch (error) {
            if (!isAbortError(error)) {
                logError('Preference hydration failed.', error);
            }
        } finally {
            if (hydrationControllerRef.current === controller) {
                hydrationControllerRef.current = null;
                hydrationPrincipalRef.current = null;
                markPreferencesReady(true);
            }
        }
    }, [markPreferencesReady]);

    return {
        isPreferencesHydrated,
        hydratePreferences,
        markPreferencesReady,
    };
}
