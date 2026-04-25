import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SafeTFunction } from '@/i18n/hooks';
import { authApi } from '@/services/authApi';
import { logError } from '@/services/logger';
import { applyAuthenticatedSession, clearExplicitLogoutSuppressed } from '@/services/session';
import { isAuthUnavailableError } from '@/services/authRequest';
import { entraAuth } from '@/services/entraAuth';

interface UseLoginActionsOptions {
    returnTo: string;
    translate: SafeTFunction;
}

interface UseLoginActionsResult {
    isLoading: string | null;
    errorKey: string;
    isSsoLoading: boolean;
    authActionUnavailableError: string | null;
    setErrorKey: (value: string) => void;
    handleDemoLogin: (email: string) => Promise<void>;
    handleSsoLogin: () => Promise<void>;
}

export function useLoginActions({ returnTo, translate }: UseLoginActionsOptions): UseLoginActionsResult {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState<string | null>(null);
    const [errorKey, setErrorKey] = useState('');
    const [isSsoLoading, setIsSsoLoading] = useState(false);
    const [authActionUnavailableError, setAuthActionUnavailableError] = useState<string | null>(null);

    const handleDemoLogin = async (email: string) => {
        clearExplicitLogoutSuppressed();
        setErrorKey('');
        setAuthActionUnavailableError(null);
        setIsLoading(email);

        try {
            const data = await authApi.demoLogin(email);
            const target = applyAuthenticatedSession(data, returnTo);
            void navigate(target, { replace: true });
        } catch (err) {
            if (isAuthUnavailableError(err)) {
                setAuthActionUnavailableError(translate('login.unavailable_service_error'));
                return;
            }
            if (err instanceof Error && err.message.startsWith('errorKeys.')) {
                setErrorKey(err.message);
            } else {
                setErrorKey('errorKeys.demo_login_failed');
            }
        } finally {
            setIsLoading(null);
        }
    };

    const handleSsoLogin = async () => {
        clearExplicitLogoutSuppressed();
        setErrorKey('');
        setAuthActionUnavailableError(null);
        setIsSsoLoading(true);

        try {
            const challenge = await authApi.ssoStart(returnTo);
            await entraAuth.loginRedirect({ nonce: challenge.nonce, state: challenge.state });
        } catch (error) {
            logError('SSO login initiation failed.', error);
            setErrorKey('errorKeys.login_failed');
        } finally {
            setIsSsoLoading(false);
        }
    };

    return {
        isLoading,
        errorKey,
        isSsoLoading,
        authActionUnavailableError,
        setErrorKey,
        handleDemoLogin,
        handleSsoLogin,
    };
}
