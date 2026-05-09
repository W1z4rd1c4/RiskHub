import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useAuthActions } from '@/contexts/auth/useAuthActions';
import type { AuthUser } from '@/services/authApi';

export interface AuthActionsContextValue {
    login: (email: string, password: string) => Promise<AuthUser>;
    logout: () => Promise<void>;
}

interface AuthActionsProviderProps {
    children: ReactNode;
    hydratePreferences?: () => Promise<void>;
    markPreferencesReady?: (ready: boolean) => void;
}

const noopHydratePreferences = () => Promise.resolve();
const noopMarkPreferencesReady = () => undefined;
const AuthActionsContext = createContext<AuthActionsContextValue | undefined>(undefined);

export function AuthActionsProvider({
    children,
    hydratePreferences = noopHydratePreferences,
    markPreferencesReady = noopMarkPreferencesReady,
}: AuthActionsProviderProps) {
    const { login, logout } = useAuthActions({
        hydratePreferences,
        markPreferencesReady,
    });

    const value = useMemo<AuthActionsContextValue>(() => ({
        login,
        logout,
    }), [
        login,
        logout,
    ]);

    return <AuthActionsContext.Provider value={value}>{children}</AuthActionsContext.Provider>;
}

export function useAuthActionsContext(): AuthActionsContextValue {
    const context = useContext(AuthActionsContext);
    if (context === undefined) {
        throw new Error('useAuthActionsContext must be used within an AuthActionsProvider');
    }
    return context;
}
