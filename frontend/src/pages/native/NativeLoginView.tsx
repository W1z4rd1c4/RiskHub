import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { AuthConfigResponse, TokenResponse } from '@/services/authApi';
import { nativeAuthApi } from '@/services/nativeAuthApi';
import { applyAuthenticatedSession, clearExplicitLogoutSuppressed } from '@/services/session';
import type { LocalAuthChallenge } from '@/types/localAuth.generated';
import { NativeFrame } from './NativeFrame';
import { NativeFactor } from './NativeFactor';
import { useNativeAction } from './useNativeAction';

export function NativeLoginView({ config, returnTo }: { config: AuthConfigResponse; returnTo: string }) {
    const { t } = useTranslation('auth');
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [challenge, setChallenge] = useState<LocalAuthChallenge | null>(null);
    const [completed, setCompleted] = useState(false);
    const action = useNativeAction(() => { setPassword(''); setChallenge(null); });
    const session = (result: TokenResponse) => {
        clearExplicitLogoutSuppressed();
        const target = applyAuthenticatedSession(result, returnTo);
        void navigate(target, { replace: true });
    };
    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (action.pending) return;
        const body = { email, password };
        setPassword(''); setCompleted(false);
        void action.run((signal) => nativeAuthApi.login(body, signal), (result) => {
            if ('challenge' in result) setChallenge(result);
            else session(result);
        });
    };
    if (challenge) return <NativeFactor challenge={challenge} mode="login" onSession={session}
        onDone={() => { setChallenge(null); setCompleted(true); }} onCancel={(reason) => { setChallenge(null); action.setError(reason ?? null); }} />;
    return <NativeFrame title={t('native.login_title')} pending={action.pending} error={action.error}>
        {completed && <p role="status">{t('native.enrolled')}</p>}
        <form className="space-y-4" onSubmit={submit}>
            <Field label={t('native.email')} required>
                {(field) => <Input {...field} type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={action.pending} />}
            </Field>
            <Field label={t('native.password')} required>
                {(field) => <Input {...field} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={action.pending} />}
            </Field>
            <Button type="submit" disabled={action.pending}>{t('native.sign_in')}</Button>
        </form>
        {config.identity?.password_reset_enabled && <Link className="block underline" to="/auth/local/reset-password">{t('native.forgot')}</Link>}
        <p className="text-sm text-muted-foreground">{t('native.invitation_only')}</p>
        {config.identity?.recovery_method === 'governed_local' && <p className="text-sm text-muted-foreground">{t('native.recovery_help')}</p>}
    </NativeFrame>;
}
