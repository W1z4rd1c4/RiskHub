import type { ReactNode } from 'react';

import { AuthActionsProvider, useAuthActionsContext } from '@/contexts/AuthActionsContext';
import { PreferencesProvider, usePreferenceActions, usePreferenceState } from '@/contexts/PreferencesContext';
import { SessionProvider, useSession } from '@/contexts/SessionContext';
import { useAuthBootstrap } from '@/contexts/auth/useAuthBootstrap';

function AuthBootstrapBridge({ children }: { children: ReactNode }) {
    const { token } = useSession();
    const {
        hydratePreferences,
        markPreferencesReady,
    } = usePreferenceActions();

    useAuthBootstrap({
        token,
        hydratePreferences,
        markPreferencesReady,
    });

    return (
        <AuthActionsProvider
            hydratePreferences={hydratePreferences}
            markPreferencesReady={markPreferencesReady}
        >
            {children}
        </AuthActionsProvider>
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

export function useAuth() {
    const session = useSession();
    const preferences = usePreferenceState();
    const actions = useAuthActionsContext();

    return {
        user: session.user,
        isLoading: session.isLoading,
        bootstrapStatus: session.bootstrapStatus,
        bootstrapError: session.bootstrapError,
        logoutPending: session.logoutPending,
        logoutErrorKey: session.logoutErrorKey,
        isPreferencesHydrated: preferences.isPreferencesHydrated,
        hasPermission: session.hasPermission,
        isAuthenticated: session.isAuthenticated,
        login: actions.login,
        logout: actions.logout,
    };
}
