import { useCallback, useState } from 'react';
import { setPreferencesReady } from '@/services/preferencesReadiness';
import { syncPreferencesFromServer } from '@/utils/userSettingsStorage';

export function usePreferenceHydration(initialReady: boolean) {
    const [isPreferencesHydrated, setIsPreferencesHydrated] = useState(initialReady);

    const markPreferencesReady = useCallback((ready: boolean) => {
        setIsPreferencesHydrated(ready);
        setPreferencesReady(ready);
    }, []);

    const hydratePreferences = useCallback(async () => {
        markPreferencesReady(false);

        try {
            await syncPreferencesFromServer();
        } catch (error) {
            console.error(error);
        } finally {
            markPreferencesReady(true);
        }
    }, [markPreferencesReady]);

    return {
        isPreferencesHydrated,
        hydratePreferences,
        markPreferencesReady,
    };
}
