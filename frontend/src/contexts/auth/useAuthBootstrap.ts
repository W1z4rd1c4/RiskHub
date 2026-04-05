import { useEffect } from 'react';
import type { AuthUser } from '@/services/authApi';
import { bootstrapAuthSession } from '@/services/authSessionCoordinator';
import { isAuthUnavailableError } from '@/services/authRequest';
import { applyBootstrappedSession, clearAuthenticatedSession } from '@/services/sessionManager';

interface UseAuthBootstrapOptions {
    token: string | null;
    hydratePreferences: () => Promise<void>;
    markPreferencesReady: (ready: boolean) => void;
    setUser: (user: AuthUser | null) => void;
    setBootstrapStatus: (status: 'loading' | 'authenticated' | 'anonymous' | 'error') => void;
    setBootstrapError: (error: 'service_unavailable' | null) => void;
    setIsLoading: (loading: boolean) => void;
}

export function useAuthBootstrap({
    token,
    hydratePreferences,
    markPreferencesReady,
    setUser,
    setBootstrapStatus,
    setBootstrapError,
    setIsLoading,
}: UseAuthBootstrapOptions): void {
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
                    markPreferencesReady(true);
                    return;
                }

                if (session.token !== token) {
                    applyBootstrappedSession({ token: session.token, user: session.user });
                }

                markPreferencesReady(false);
                setUser(session.user);
                await hydratePreferences();
                if (isMounted) {
                    setBootstrapStatus('authenticated');
                    setBootstrapError(null);
                }
            } catch (error) {
                if (isMounted) {
                    clearAuthenticatedSession({ clearBootstrap: true });
                    setUser(null);
                    setBootstrapStatus(isAuthUnavailableError(error) ? 'error' : 'anonymous');
                    setBootstrapError(isAuthUnavailableError(error) ? 'service_unavailable' : null);
                    markPreferencesReady(true);
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        void fetchCurrentUser();

        return () => {
            isMounted = false;
        };
    }, [
        hydratePreferences,
        markPreferencesReady,
        setBootstrapError,
        setBootstrapStatus,
        setIsLoading,
        setUser,
        token,
    ]);
}
