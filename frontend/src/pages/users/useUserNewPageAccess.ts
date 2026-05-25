import { useEffect, useState } from 'react';

import type { AuthConfigResponse } from '@/services/authApi';
import { getAuthConfig } from '@/services/authConfig';
import { isAuthUnavailableError } from '@/services/authRequest';
import { logError } from '@/services/logger';
import { userDirectoryApi } from '@/services/userDirectoryApi';
import type { UserDirectoryCapabilities } from '@/types/user';

type Translate = (key: string, options?: { ns?: string }) => string;

export function useUserNewPageAccess(t: Translate) {
    const [authConfig, setAuthConfig] = useState<AuthConfigResponse | null>(null);
    const [isAuthConfigLoading, setIsAuthConfigLoading] = useState(true);
    const [directoryCapabilities, setDirectoryCapabilities] = useState<UserDirectoryCapabilities | null>(null);
    const [authConfigError, setAuthConfigError] = useState<string | null>(null);
    const [isDirectoryProviderUnavailable, setIsDirectoryProviderUnavailable] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function run(): Promise<void> {
            try {
                const config = await getAuthConfig();
                if (cancelled) return;
                setAuthConfig(config);

                try {
                    const directoryResponse = await userDirectoryApi.listDirectoryUsers({ skip: 0, limit: 1 });
                    if (!cancelled) {
                        setDirectoryCapabilities(directoryResponse.capabilities ?? null);
                    }
                } catch (directoryError) {
                    logError('Failed to load user directory capabilities:', directoryError);
                    if (!cancelled) {
                        setDirectoryCapabilities(null);
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
        };
    }, [t]);

    return {
        authConfig,
        authConfigError,
        directoryCapabilities,
        isAuthConfigLoading,
        isDirectoryProviderUnavailable,
        setIsDirectoryProviderUnavailable,
    };
}
