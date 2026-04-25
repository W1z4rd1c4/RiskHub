import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-4">
            <div className="w-full max-w-md text-center">
                {errorKey ? (
                    <>
                        <h1 className="text-xl font-bold mb-2">{t('sso_callback.sign_in_failed_title')}</h1>
                        <p className="text-sm text-slate-300 mb-6">{errorKey ? t(errorKey) : ''}</p>
                        <button
                            className="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-500 transition-colors"
                            onClick={() => navigate('/login', { replace: true })}
                        >
                            {t('sso_callback.back_to_login')}
                        </button>
                    </>
                ) : (
                    <>
                        <h1 className="text-xl font-bold mb-2">{t('sso_callback.signing_in_title')}</h1>
                        <p className="text-sm text-slate-400">{t('sso_callback.signing_in_subtitle')}</p>
                    </>
                )}
            </div>
        </div>
    );
}
