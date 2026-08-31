import { createContext, useContext, type ReactNode } from 'react';

import { AuthActionsProvider, useAuthActionsContext } from '@/contexts/AuthActionsContext';
import { PreferencesProvider, usePreferenceActions, usePreferenceState } from '@/contexts/PreferencesContext';
import { SessionProvider, useSession } from '@/contexts/SessionContext';
import { useAuthBootstrap } from '@/contexts/auth/useAuthBootstrap';

const AuthBootstrapPhaseContext = createContext<'pending' | 'ready' | 'failed'>('pending');

function AuthBootstrapBridge({ children }: { children: ReactNode }) {
    const { token } = useSession();
    const {
        hydratePreferences,
        markPreferencesReady,
    } = usePreferenceActions();

    const bootstrapPhase = useAuthBootstrap({
        token,
        hydratePreferences,
        markPreferencesReady,
    });

    return (
        <AuthBootstrapPhaseContext.Provider value={bootstrapPhase}>
            <AuthActionsProvider
                hydratePreferences={hydratePreferences}
                markPreferencesReady={markPreferencesReady}
            >
                {children}
            </AuthActionsProvider>
        </AuthBootstrapPhaseContext.Provider>
    );
}

export function AuthProvider({ children }: { children: ReactNode }) {
    return (
        <SessionProvider>
            <PreferencesProvider>
                <AuthBootstrapBridge>{children}</AuthBootstrapBridge>
            </PreferencesProvider>
        </SessionProvider>
    );
}

// Keep the combined auth surface while call-site density is low; migrate only a future high-frequency consumer that needs render isolation.
export function useAuth() {
    const session = useSession();
    const preferences = usePreferenceState();
    const actions = useAuthActionsContext();
    const bootstrapPhase = useContext(AuthBootstrapPhaseContext);

    return {
        user: session.user,
        isLoading: session.isLoading || bootstrapPhase === 'pending',
        bootstrapStatus: session.bootstrapStatus,
        bootstrapError: session.bootstrapError,
        logoutPending: session.logoutPending,
        logoutErrorKey: session.logoutErrorKey,
        isPreferencesHydrated: preferences.isPreferencesHydrated,
        hasPermission: session.hasPermission,
        isAuthenticated: bootstrapPhase === 'ready' && session.isAuthenticated,
        login: actions.login,
        logout: actions.logout,
    };
}
