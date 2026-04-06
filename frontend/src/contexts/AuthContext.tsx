import { createContext, useCallback, useContext, type ReactNode } from 'react';
import type { AuthUser } from '@/services/authApi';
import { hasUserPermission } from '@/contexts/auth/permissions';
import { usePreferenceHydration } from '@/contexts/auth/usePreferenceHydration';
import { useAuthBootstrap } from '@/contexts/auth/useAuthBootstrap';
import { useAuthActions } from '@/contexts/auth/useAuthActions';
import { useSessionSnapshot } from '@/services/sessionStore';

type User = AuthUser;

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    bootstrapStatus: 'loading' | 'authenticated' | 'anonymous' | 'error';
    bootstrapError: 'service_unavailable' | null;
    logoutPending: boolean;
    logoutErrorKey: string | null;
    isPreferencesHydrated: boolean;
    hasPermission: (resource: string, action: string) => boolean;
    isAuthenticated: boolean;
    login: (email: string, password: string) => Promise<User>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const session = useSessionSnapshot();
    const {
        isPreferencesHydrated,
        hydratePreferences,
        markPreferencesReady,
    } = usePreferenceHydration(!session.token);

    const { login, logout } = useAuthActions({
        hydratePreferences,
        markPreferencesReady,
    });

    useAuthBootstrap({
        token: session.token,
        hydratePreferences,
        markPreferencesReady,
    });

    const hasPermission = useCallback((resource: string, action: string): boolean => {
        return hasUserPermission(session.user, resource, action);
    }, [session.user]);

    return (
        <AuthContext.Provider
            value={{
                user: session.user,
                isLoading: session.bootstrapStatus === 'loading',
                bootstrapStatus: session.bootstrapStatus,
                bootstrapError: session.bootstrapError,
                logoutPending: session.logoutPending,
                logoutErrorKey: session.logoutErrorKey,
                isPreferencesHydrated,
                hasPermission,
                isAuthenticated: Boolean(session.token && session.user),
                login,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
