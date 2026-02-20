import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setAccessToken } from '@/services/accessTokenStore';
import { authApi } from '@/services/authApi';
import { entraAuth } from '@/services/entraAuth';
import { hardNavigate } from '@/utils/hardNavigate';

function sanitizeReturnTo(value: string | null | undefined): string {
    if (!value) return '/';
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    return '/';
}

export default function SsoCallbackPage() {
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            try {
                const result = await entraAuth.handleRedirect();
                const idToken = result?.idToken;
                if (!idToken) {
                    navigate('/login', { replace: true });
                    return;
                }

                const tokenResponse = await authApi.ssoExchange(idToken);
                setAccessToken(tokenResponse.access_token);
                hardNavigate(sanitizeReturnTo(result?.state));
            } catch (e) {
                console.error(e);
                if (cancelled) return;
                setError('Single sign-on failed. Please try again.');
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
                {error ? (
                    <>
                        <h1 className="text-xl font-bold mb-2">Sign-in failed</h1>
                        <p className="text-sm text-slate-300 mb-6">{error}</p>
                        <button
                            className="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-500 transition-colors"
                            onClick={() => navigate('/login', { replace: true })}
                        >
                            Back to login
                        </button>
                    </>
                ) : (
                    <>
                        <h1 className="text-xl font-bold mb-2">Signing you in…</h1>
                        <p className="text-sm text-slate-400">Completing single sign-on.</p>
                    </>
                )}
            </div>
        </div>
    );
}
