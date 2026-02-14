import { createContext, useCallback, useContext, useState, useEffect, type ReactNode } from 'react';
import { authApi } from '@/services/authApi';
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
    const [token, setTokenState] = useState<string | null>(() =>
        localStorage.getItem('access_token')
    );
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

    const setToken = (newToken: string) => {
        localStorage.setItem('access_token', newToken);
        setTokenState(newToken);
    };

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
            throw new Error(err instanceof Error ? err.message : 'Login failed');
        }
    };

    const logout = useCallback(() => {
        localStorage.removeItem('access_token');
        clearLocalSettings(); // Clear theme/language
        setTokenState(null);
        setUser(null);
        setIsPreferencesHydrated(true);
        updatePreferencesReadySignal(true);
    }, [updatePreferencesReadySignal]);

    useEffect(() => {
        let isMounted = true;

        const fetchCurrentUser = async () => {
            if (!token) {
                if (isMounted) {
                    setIsPreferencesHydrated(true);
                    updatePreferencesReadySignal(true);
                    setIsLoading(false);
                }
                return;
            }

            try {
                if (isMounted) {
                    setIsPreferencesHydrated(false);
                    updatePreferencesReadySignal(false);
                }
                const userData = await authApi.getCurrentUser(token);
                if (isMounted) {
                    setUser(userData);
                }
                await hydratePreferences();
            } catch {
                // Token invalid, clear it
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
    }, [hydratePreferences, logout, token, updatePreferencesReadySignal]);

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
