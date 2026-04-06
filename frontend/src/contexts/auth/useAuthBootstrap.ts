import { useEffect } from 'react';
import { bootstrapAuthSession } from '@/services/authSessionCoordinator';
import { isAuthUnavailableError } from '@/services/authRequest';
import {
    applyAnonymousSession,
    applyBootstrappingSession,
    applyBootstrappedSession,
    applyBootstrapError,
} from '@/services/sessionManager';
import { getSessionSnapshot } from '@/services/sessionStore';

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
                const session = await bootstrapAuthSession();
                if (!isMounted) return;

                if (!session.token || !session.user) {
                    applyAnonymousSession();
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
                    if (isAuthUnavailableError(error)) {
                        applyBootstrapError('service_unavailable');
                    } else {
                        applyAnonymousSession();
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
