import { createContext, useCallback, useContext, useState, useEffect, type ReactNode } from 'react';
import { authApi } from '@/services/authApi';
import { clearAccessToken, getAccessToken, setAccessToken, subscribeAccessToken } from '@/services/accessTokenStore';
import { bootstrapAuthSession, cacheBootstrapSession, clearBootstrapSession } from '@/services/authSessionCoordinator';
import { isAuthUnavailableError } from '@/services/authRequest';
import { syncPreferencesFromServer, clearLocalSettings } from '@/utils/userSettingsStorage';

interface User {
    id: number;
    email: string;
    name: string;
    role: string;
    role_display_name: string;
    department_id?: number;
    department_name?: string;
    permissions: string[];
    effective_permissions: string[];
    access_scope: 'global' | 'department' | 'manager';
    scope_label: string;
}

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    bootstrapStatus: 'loading' | 'authenticated' | 'anonymous' | 'error';
    bootstrapError: 'service_unavailable' | null;
    isPreferencesHydrated: boolean;
    hasPermission: (resource: string, action: string) => boolean;
    isAuthenticated: boolean;
    login: (email: string, password: string) => Promise<User>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [token, setTokenState] = useState<string | null>(() => getAccessToken());
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [bootstrapStatus, setBootstrapStatus] = useState<'loading' | 'authenticated' | 'anonymous' | 'error'>('loading');
    const [bootstrapError, setBootstrapError] = useState<'service_unavailable' | null>(null);
    const [isPreferencesHydrated, setIsPreferencesHydrated] = useState(!token);

    const updatePreferencesReadySignal = useCallback((ready: boolean) => {
        if (typeof window !== 'undefined') {
            window.__RISKHUB_PREFERENCES_READY__ = ready;
        }
        if (typeof document !== 'undefined') {
            document.documentElement.dataset.preferencesHydrated = ready ? 'true' : 'false';
        }
    }, []);

    const setToken = useCallback((newToken: string) => {
        setAccessToken(newToken);
        setTokenState(newToken);
    }, []);

    const clearToken = useCallback(() => {
        clearAccessToken();
        setTokenState(null);
    }, []);

    useEffect(() => subscribeAccessToken(setTokenState), []);

    const hydratePreferences = useCallback(async () => {
        setIsPreferencesHydrated(false);
        updatePreferencesReadySignal(false);

        try {
            await syncPreferencesFromServer();
        } catch (error) {
            console.error(error);
        } finally {
            setIsPreferencesHydrated(true);
            updatePreferencesReadySignal(true);
        }
    }, [updatePreferencesReadySignal]);

    const login = async (email: string, password: string): Promise<User> => {
        try {
            const response = await authApi.login({ email, password });
            setToken(response.access_token);
            cacheBootstrapSession(response.user, response.access_token);
            setUser(response.user);
            setBootstrapStatus('authenticated');
            setBootstrapError(null);

            // Keep settings hydration deterministic for theme/language persistence.
            await hydratePreferences();

            return response.user;
        } catch (err) {
            throw new Error(err instanceof Error ? err.message : 'Login failed', { cause: err });
        }
    };

    const logout = useCallback(() => {
        void authApi.logout();
        clearToken();
        clearBootstrapSession();
        clearLocalSettings(); // Clear theme/language
        setUser(null);
        setBootstrapStatus('anonymous');
        setBootstrapError(null);
        setIsPreferencesHydrated(true);
        updatePreferencesReadySignal(true);
    }, [clearToken, updatePreferencesReadySignal]);

    useEffect(() => {
        let isMounted = true;

        const fetchCurrentUser = async () => {
            try {
                const session = await bootstrapAuthSession();
                if (!isMounted) return;

                if (!session.token || !session.user) {
                    setUser(null);
                    setBootstrapStatus('anonymous');
                    setBootstrapError(null);
                    setIsPreferencesHydrated(true);
                    updatePreferencesReadySignal(true);
                    return;
                }

                if (session.token !== token) {
                    setToken(session.token);
                }

                setIsPreferencesHydrated(false);
                updatePreferencesReadySignal(false);
                setUser(session.user);
                await hydratePreferences();
                if (isMounted) {
                    setBootstrapStatus('authenticated');
                    setBootstrapError(null);
                }
            } catch (error) {
                if (isMounted) {
                    clearBootstrapSession();
                    clearToken();
                    setUser(null);
                    setBootstrapStatus(isAuthUnavailableError(error) ? 'error' : 'anonymous');
                    setBootstrapError(isAuthUnavailableError(error) ? 'service_unavailable' : null);
                    setIsPreferencesHydrated(true);
                    updatePreferencesReadySignal(true);
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        fetchCurrentUser();

        return () => {
            isMounted = false;
        };
    }, [clearToken, hydratePreferences, setToken, token, updatePreferencesReadySignal]);

    const hasPermission = (resource: string, action: string): boolean => {
        // Use effective_permissions if available, fallback to permissions
        const perms = user?.effective_permissions ?? user?.permissions ?? [];
        return perms.some((perm) => {
            const [permResource, permAction] = perm.split(':');
            return (permResource === '*' || permResource === resource) &&
                (permAction === '*' || permAction === action);
        });
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading,
                bootstrapStatus,
                bootstrapError,
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
