import { useEffect, useState } from 'react';

import type { AuthMode } from '@/services/authApi';
import { getAuthConfig } from '@/services/authConfig';
import { isAuthUnavailableError } from '@/services/authRequest';
import { logError } from '@/services/logger';
import { useTranslation } from '@/i18n/hooks';

export type AuthModeStatus = 'loading' | 'ready' | 'error';

export function useUsersAuthMode() {
    const { t } = useTranslation('admin');
    const [authMode, setAuthMode] = useState<AuthMode | null>(null);
    const [authModeStatus, setAuthModeStatus] = useState<AuthModeStatus>('loading');
    const [authModeError, setAuthModeError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function run(): Promise<void> {
            try {
                const config = await getAuthConfig();
                if (cancelled) return;
                setAuthMode(config.auth_mode);
                setAuthModeStatus('ready');
                setAuthModeError(null);
            } catch (error) {
                if (cancelled) return;
                logError('Failed to load auth mode for UsersPage.', error);
                setAuthMode(null);
                setAuthModeStatus('error');
                setAuthModeError(
                    isAuthUnavailableError(error)
                        ? t('users.auth_mode_service_unavailable')
                        : t('users.auth_mode_load_failed'),
                );
            }
        }

        void run();

        return () => {
            cancelled = true;
        };
    }, [t]);

    return {
        authMode,
        authModeError,
        authModeStatus,
        isAuthModeReady: authModeStatus === 'ready',
    };
}
