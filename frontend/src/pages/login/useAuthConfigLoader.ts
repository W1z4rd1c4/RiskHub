import { useEffect, useState } from 'react';
import type { AuthConfigResponse } from '@/services/authApi';
import { clearAuthConfigCache, getAuthConfig } from '@/services/authConfig';
import { isAuthUnavailableError } from '@/services/authRequest';

interface UseAuthConfigLoaderOptions {
    unavailableServiceMessage: string;
    unavailableConfigMessage: string;
}

export function useAuthConfigLoader({
    unavailableServiceMessage,
    unavailableConfigMessage,
}: UseAuthConfigLoaderOptions) {
    const [authConfig, setAuthConfig] = useState<AuthConfigResponse | null>(null);
    const [authConfigError, setAuthConfigError] = useState<string | null>(null);
    const [isAuthConfigLoading, setIsAuthConfigLoading] = useState(true);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                const config = await getAuthConfig();
                if (cancelled) return;
                setAuthConfig(config);
                setAuthConfigError(null);
            } catch (error) {
                if (cancelled) return;
                if (isAuthUnavailableError(error)) {
                    setAuthConfigError(unavailableServiceMessage);
                    return;
                }
                setAuthConfigError(error instanceof Error ? error.message : unavailableConfigMessage);
            } finally {
                if (!cancelled) {
                    setIsAuthConfigLoading(false);
                }
            }
        };

        void load();

        return () => {
            cancelled = true;
        };
    }, [reloadKey, unavailableConfigMessage, unavailableServiceMessage]);

    const reloadAuthConfig = () => {
        clearAuthConfigCache();
        setAuthConfig(null);
        setAuthConfigError(null);
        setIsAuthConfigLoading(true);
        setReloadKey((value) => value + 1);
    };

    return {
        authConfig,
        authConfigError,
        isAuthConfigLoading,
        reloadAuthConfig,
    };
}
