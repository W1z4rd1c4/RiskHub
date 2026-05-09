import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { usePreferenceHydration } from '@/contexts/auth/usePreferenceHydration';
import { useSessionSnapshot } from '@/services/session';

export interface PreferenceStateContextValue {
    isPreferencesHydrated: boolean;
}

export interface PreferenceActionsContextValue {
    hydratePreferences: () => Promise<void>;
    markPreferencesReady: (ready: boolean) => void;
}

const PreferenceStateContext = createContext<PreferenceStateContextValue | undefined>(undefined);
const PreferenceActionsContext = createContext<PreferenceActionsContextValue | undefined>(undefined);

export function PreferencesProvider({ children }: { children: ReactNode }) {
    const session = useSessionSnapshot();
    const {
        isPreferencesHydrated,
        hydratePreferences,
        markPreferencesReady,
    } = usePreferenceHydration(!session.token);

    const stateValue = useMemo<PreferenceStateContextValue>(() => ({
        isPreferencesHydrated,
    }), [isPreferencesHydrated]);

    const actionsValue = useMemo<PreferenceActionsContextValue>(() => ({
        hydratePreferences,
        markPreferencesReady,
    }), [
        hydratePreferences,
        markPreferencesReady,
    ]);

    return (
        <PreferenceStateContext.Provider value={stateValue}>
            <PreferenceActionsContext.Provider value={actionsValue}>
                {children}
            </PreferenceActionsContext.Provider>
        </PreferenceStateContext.Provider>
    );
}

export function usePreferenceState(): PreferenceStateContextValue {
    const context = useContext(PreferenceStateContext);
    if (context === undefined) {
        throw new Error('usePreferenceState must be used within a PreferencesProvider');
    }
    return context;
}

export function usePreferenceActions(): PreferenceActionsContextValue {
    const context = useContext(PreferenceActionsContext);
    if (context === undefined) {
        throw new Error('usePreferenceActions must be used within a PreferencesProvider');
    }
    return context;
}
