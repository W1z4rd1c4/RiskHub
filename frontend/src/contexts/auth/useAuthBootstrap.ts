import { useEffect, useState } from 'react';
import { isAuthUnavailableError } from '@/services/authRequest';
import { getAuthConfig } from '@/services/authConfig';
import {
    applyAnonymousSession,
    bootstrapAuthSession,
    applyBootstrappedSession,
    applyBootstrapError,
    getSessionSnapshot,
} from '@/services/session';

interface UseAuthBootstrapOptions {
    token: string | null;
    hydratePreferences: () => Promise<void>;
    markPreferencesReady: (ready: boolean) => void;
}

export type AuthBootstrapPhase = 'pending' | 'ready' | 'failed';

export function useAuthBootstrap({
    token,
    hydratePreferences,
    markPreferencesReady,
}: UseAuthBootstrapOptions): AuthBootstrapPhase {
    const [phase, setPhase] = useState<AuthBootstrapPhase>('pending');

    useEffect(() => {
        if (!token && getSessionSnapshot().bootstrapStatus === 'error') {
            markPreferencesReady(true);
            setPhase('failed');
            return;
        }

        setPhase((current) => current === 'ready' ? current : 'pending');

        let isMounted = true;

        const fetchCurrentUser = async () => {
            try {
                // Public configuration and session restoration do not depend on
                // one another. Start both at boot, then apply identity only after
                // configuration has established the authorization mode.
                const [configResult, sessionResult] = await Promise.allSettled([
                    getAuthConfig(),
                    bootstrapAuthSession(),
                ]);
                if (!isMounted) return;

                if (configResult.status === 'rejected') {
                    throw configResult.reason;
                }
                if (sessionResult.status === 'rejected') {
                    throw sessionResult.reason;
                }

                const session = sessionResult.value;
                const preserveLogoutError = getSessionSnapshot().logoutErrorKey !== null;

                if (!session.token || !session.user) {
                    applyAnonymousSession({ preserveLogoutError });
                    markPreferencesReady(true);
                    setPhase('ready');
                    return;
                }

                applyBootstrappedSession({ token: session.token, user: session.user });
                markPreferencesReady(false);
                void hydratePreferences();
                setPhase('ready');
            } catch (error) {
                if (isMounted) {
                    const preserveLogoutError = getSessionSnapshot().logoutErrorKey !== null;
                    if (isAuthUnavailableError(error)) {
                        applyBootstrapError('service_unavailable');
                    } else {
                        applyAnonymousSession({ preserveLogoutError });
                    }
                    markPreferencesReady(true);
                    setPhase('failed');
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

    return phase;
}
