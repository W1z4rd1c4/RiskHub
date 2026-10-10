import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthFrame } from '@/components/layout/AuthFrame';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/state';
import { authApi } from '@/services/authApi';
import { entraAuth } from '@/services/entraAuth';
import { applyAuthenticatedSession, clearExplicitLogoutSuppressed } from '@/services/session';
import { useTranslation } from '@/i18n/hooks';
import { logError } from '@/services/logger';

export default function SsoCallbackPage() {
    const navigate = useNavigate();
    const { t } = useTranslation('auth');
    const [errorKey, setErrorKey] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            try {
                const result = await entraAuth.handleRedirect();
                const idToken = result?.idToken;
                if (!idToken) {
                    void navigate('/login', { replace: true });
                    return;
                }
                if (!result?.state) {
                    void navigate('/login?authError=sso_callback_failed', { replace: true });
                    return;
                }

                const tokenResponse = await authApi.ssoExchange(idToken, result.state);
                clearExplicitLogoutSuppressed();
                const target = applyAuthenticatedSession(tokenResponse);
                void navigate(target, { replace: true });
            } catch (error) {
                logError('SSO callback exchange failed.', error);
                if (cancelled) return;
                setErrorKey('sso_callback.exchange_failed');
            }
        };

        void run();

        return () => {
            cancelled = true;
        };
    }, [navigate]);

    if (errorKey) {
        return (
            <AuthFrame title={t('sso_callback.sign_in_failed_title')} error={t(errorKey)}>
                <Button variant="accent" className="w-full" onClick={() => { void navigate('/login', { replace: true }); }}>
                    {t('sso_callback.back_to_login')}
                </Button>
            </AuthFrame>
        );
    }

    return (
        <AuthFrame title={t('sso_callback.signing_in_title')} busy status={t('sso_callback.signing_in_subtitle')}>
            <div className="flex justify-center py-2">
                <Spinner size="lg" />
            </div>
        </AuthFrame>
    );
}
