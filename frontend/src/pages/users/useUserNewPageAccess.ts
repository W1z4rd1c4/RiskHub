import { useEffect, useState } from 'react';

import type { AuthConfigResponse } from '@/services/authApi';
import { getAuthConfig } from '@/services/authConfig';
import { isAuthUnavailableError } from '@/services/authRequest';
import { logError } from '@/services/logger';
import { userDirectoryApi } from '@/services/userDirectoryApi';
import type { UserDirectoryCapabilities } from '@/types/user';

type Translate = (key: string, options?: { ns?: string }) => string;

export function useUserNewPageAccess(t: Translate) {
    const [retry, setRetry] = useState(0);
    const [authConfig, setAuthConfig] = useState<AuthConfigResponse | null>(null);
    const [isAuthConfigLoading, setIsAuthConfigLoading] = useState(true);
    const [directoryCapabilities, setDirectoryCapabilities] = useState<UserDirectoryCapabilities | null>(null);
    const [authConfigError, setAuthConfigError] = useState<string | null>(null);
    const [isDirectoryProviderUnavailable, setIsDirectoryProviderUnavailable] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();
        setIsAuthConfigLoading(true); setAuthConfigError(null);

        async function run(): Promise<void> {
            try {
                const config = await getAuthConfig();
                if (cancelled) return;
                setAuthConfig(config);
                if (config.identity?.mode === 'native') return;

                try {
                    const directoryResponse = await userDirectoryApi.listDirectoryUsers({ skip: 0, limit: 1 }, { signal: controller.signal });
                    if (!cancelled) {
                        setDirectoryCapabilities(directoryResponse.capabilities ?? null);
                    }
                } catch (directoryError) {
                    logError('Failed to load user directory capabilities:', directoryError);
                    if (!cancelled) {
                        setDirectoryCapabilities(null);
                        setAuthConfigError(t('user_new.auth_mode_load_failed', { ns: 'admin' }));
                    }
                }
            } catch (error) {
                if (cancelled) return;
                logError('Failed to load auth mode:', error);
                setAuthConfigError(
                    isAuthUnavailableError(error)
                        ? t('user_new.auth_mode_service_unavailable', { ns: 'admin' })
                        : (error instanceof Error ? error.message : String(error)),
                );
            } finally {
                if (!cancelled) {
                    setIsAuthConfigLoading(false);
                }
            }
        }

        void run();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [t, retry]);

    return {
        retryAccess: () => setRetry((value) => value + 1),
        authConfig,
        authConfigError,
        directoryCapabilities,
        isAuthConfigLoading,
        isDirectoryProviderUnavailable,
        setIsDirectoryProviderUnavailable,
    };
}
