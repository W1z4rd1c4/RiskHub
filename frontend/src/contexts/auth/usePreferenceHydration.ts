import { useCallback, useState } from 'react';
import { logError } from '@/services/logger';
import { syncPreferencesFromServer } from '@/utils/userSettingsStorage';

export function usePreferenceHydration(initialReady: boolean) {
    const [isPreferencesHydrated, setIsPreferencesHydrated] = useState(initialReady);

    const markPreferencesReady = useCallback((ready: boolean) => {
        setIsPreferencesHydrated(ready);
    }, []);

    const hydratePreferences = useCallback(async () => {
        markPreferencesReady(false);

        try {
            await syncPreferencesFromServer();
        } catch (error) {
            logError('Preference hydration failed.', error);
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
