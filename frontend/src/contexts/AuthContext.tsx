import { createContext, useCallback, useContext, useState, useEffect, type ReactNode } from 'react';
import { authApi } from '@/services/authApi';
import { clearAccessToken, getAccessToken, setAccessToken } from '@/services/accessTokenStore';
import { silentReauthAndExchange } from '@/services/ssoSession';
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
            setUser(response.user);

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
        clearLocalSettings(); // Clear theme/language
        setUser(null);
        setIsPreferencesHydrated(true);
        updatePreferencesReadySignal(true);
    }, [clearToken, updatePreferencesReadySignal]);

    useEffect(() => {
        let isMounted = true;

        const fetchCurrentUser = async () => {
            let activeToken = token;
            let usedSilentToken = false;

            try {
                if (!activeToken) {
                    const refreshedToken = await silentReauthAndExchange();
                    if (!refreshedToken) {
                        if (isMounted) {
                            setIsPreferencesHydrated(true);
                            updatePreferencesReadySignal(true);
                        }
                        return;
                    }
                    usedSilentToken = true;
                    activeToken = refreshedToken;
                    if (isMounted) {
                        setToken(refreshedToken);
                    }
                }

                if (isMounted) {
                    setIsPreferencesHydrated(false);
                    updatePreferencesReadySignal(false);
                }
                const userData = await authApi.getCurrentUser(activeToken);
                if (isMounted) {
                    setUser(userData);
                }
                await hydratePreferences();
            } catch {
                if (!usedSilentToken) {
                    const refreshedToken = await silentReauthAndExchange();
                    try {
                        if (refreshedToken) {
                            if (isMounted) {
                                setToken(refreshedToken);
                            }
                            const userData = await authApi.getCurrentUser(refreshedToken);
                            if (isMounted) {
                                setUser(userData);
                            }
                            await hydratePreferences();
                            return;
                        }
                    } catch {
                        // Fall through to logout.
                    }
                }

                if (isMounted) {
                    logout();
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
    }, [hydratePreferences, logout, setToken, token, updatePreferencesReadySignal]);

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
