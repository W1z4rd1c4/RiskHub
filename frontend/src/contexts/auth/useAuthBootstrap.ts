import { useEffect } from 'react';
import { isAuthUnavailableError } from '@/services/authRequest';
import { getAuthConfig } from '@/services/authConfig';
import {
    applyAnonymousSession,
    bootstrapAuthSession,
    applyBootstrappingSession,
    applyBootstrappedSession,
    applyBootstrapError,
    getSessionSnapshot,
} from '@/services/session';

interface UseAuthBootstrapOptions {
    token: string | null;
    hydratePreferences: () => Promise<void>;
    markPreferencesReady: (ready: boolean) => void;
}

export function useAuthBootstrap({
    token,
    hydratePreferences,
    markPreferencesReady,
}: UseAuthBootstrapOptions): void {
    useEffect(() => {
        if (!token && getSessionSnapshot().bootstrapStatus === 'error') {
            markPreferencesReady(true);
            return;
        }

        let isMounted = true;

        const fetchCurrentUser = async () => {
            try {
                await getAuthConfig().catch(() => null);
                const session = await bootstrapAuthSession();
                if (!isMounted) return;
                const preserveLogoutError = getSessionSnapshot().logoutErrorKey !== null;

                if (!session.token || !session.user) {
                    applyAnonymousSession({ preserveLogoutError });
                    markPreferencesReady(true);
                    return;
                }

                applyBootstrappingSession({ token: session.token, user: session.user });
                markPreferencesReady(false);
                await hydratePreferences();
                if (!isMounted) {
                    return;
                }
                applyBootstrappedSession({ token: session.token, user: session.user });
            } catch (error) {
                if (isMounted) {
                    const preserveLogoutError = getSessionSnapshot().logoutErrorKey !== null;
                    if (isAuthUnavailableError(error)) {
                        applyBootstrapError('service_unavailable');
                    } else {
                        applyAnonymousSession({ preserveLogoutError });
                    }
                    markPreferencesReady(true);
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
        token,
    ]);
}
