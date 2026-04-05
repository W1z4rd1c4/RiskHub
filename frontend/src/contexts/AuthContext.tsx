import { createContext, useCallback, useContext, useState, useEffect, type ReactNode } from 'react';
import type { AuthUser } from '@/services/authApi';
import { getAccessToken, subscribeAccessToken } from '@/services/accessTokenStore';
import { hasUserPermission } from '@/contexts/auth/permissions';
import { usePreferenceHydration } from '@/contexts/auth/usePreferenceHydration';
import { useAuthBootstrap } from '@/contexts/auth/useAuthBootstrap';
import { useAuthActions } from '@/contexts/auth/useAuthActions';

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
    const [token, setTokenState] = useState<string | null>(() => getAccessToken());
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [bootstrapStatus, setBootstrapStatus] = useState<'loading' | 'authenticated' | 'anonymous' | 'error'>('loading');
    const [bootstrapError, setBootstrapError] = useState<'service_unavailable' | null>(null);
    const [logoutPending, setLogoutPending] = useState(false);
    const [logoutErrorKey, setLogoutErrorKey] = useState<string | null>(null);
    const {
        isPreferencesHydrated,
        hydratePreferences,
        markPreferencesReady,
    } = usePreferenceHydration(!token);

    useEffect(() => subscribeAccessToken(setTokenState), []);

    const { login, logout } = useAuthActions({
        hydratePreferences,
        markPreferencesReady,
        setUser,
        setBootstrapStatus,
        setBootstrapError,
        setLogoutPending,
        setLogoutErrorKey,
    });

    useAuthBootstrap({
        token,
        hydratePreferences,
        markPreferencesReady,
        setUser,
        setBootstrapStatus,
        setBootstrapError,
        setIsLoading,
    });

    const hasPermission = useCallback((resource: string, action: string): boolean => {
        return hasUserPermission(user, resource, action);
    }, [user]);

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading,
                bootstrapStatus,
                bootstrapError,
                logoutPending,
                logoutErrorKey,
                isPreferencesHydrated,
                hasPermission,
                isAuthenticated: !!token && !!user,
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
