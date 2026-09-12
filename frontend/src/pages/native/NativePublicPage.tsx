import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { nativeAuthApi } from '@/services/nativeAuthApi';
import { useSessionSnapshot } from '@/services/session';
import { resolveNativeRoute } from '@/routing/public';
import { useAuthConfigLoader } from '@/pages/login/useAuthConfigLoader';
import type { FactorSetupResponse, LocalAuthChallenge } from '@/types/localAuth.generated';
import { NativeFrame } from './NativeFrame';
import { NativeFactor } from './NativeFactor';
import { recoveryCredential, useFragmentCredential } from './useFragmentCredential';
import { useNativeAction } from './useNativeAction';

export default function NativePublicPage() {
    const { t } = useTranslation('auth');
    const location = useLocation();
    const navigate = useNavigate();
    const session = useSessionSnapshot();
    const [grant, setGrant] = useFragmentCredential();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [verifiedGrant, setVerifiedGrant] = useState('');
    const [recoveryKind, setRecoveryKind] = useState<'factor' | 'password'>('factor');
    const [challenge, setChallenge] = useState<LocalAuthChallenge | FactorSetupResponse | null>(null);
    const [finished, setFinished] = useState<'accepted' | 'completed' | null>(null);
    const [uncertain, setUncertain] = useState(false);
    const action = useNativeAction(() => { setPassword(''); setNewPassword(''); setGrant(''); setVerifiedGrant(''); });
    const config = useAuthConfigLoader({ unavailableServiceMessage: t('native.errors.unavailable'), unavailableConfigMessage: t('native.errors.unavailable') });
    const routeKey = resolveNativeRoute(location.pathname)?.key;
    const enrollment = routeKey === 'native-enroll';
    const recoveryEmail = routeKey === 'native-recover-email';
    const recovery = routeKey === 'native-recover' || recoveryEmail;
    const permitted = config.authConfig?.identity?.mode === 'native' && (
        enrollment ? config.authConfig.identity.local_enrollment_enabled :
            recovery ? config.authConfig.identity.recovery_method === 'governed_local' : config.authConfig.identity.password_reset_enabled
    );
    const title = t(enrollment ? 'native.enroll_title' : recovery ? 'native.recover_title' : 'native.reset_title');
    const leave = () => { action.cancel(); setPassword(''); setNewPassword(''); setGrant(''); setVerifiedGrant(''); setChallenge(null); void navigate('/login', { replace: true }); };
    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (action.pending || !permitted || uncertain) return;
        if (recovery && verifiedGrant && !recoveryCredential(verifiedGrant)) { action.setError('invalid'); return; }
        const secret = password;
        const nextPassword = newPassword;
        setPassword(''); setNewPassword('');
        void action.run(async (signal) => {
            if (enrollment) return nativeAuthApi.enrollment({ grant, password: nextPassword }, { signal });
            if (recovery) return nativeAuthApi.recoveryStart({
                grant: recoveryEmail ? recoveryCredential(verifiedGrant) : grant,
                verified_email_grant: recoveryEmail ? grant : recoveryCredential(verifiedGrant) || undefined,
                current_password: recoveryKind === 'factor' ? secret : undefined,
                new_password: recoveryKind === 'password' ? nextPassword : undefined,
            }, { signal });
            if (grant) return nativeAuthApi.resetComplete({ grant, password: nextPassword }, { signal });
            return nativeAuthApi.resetRequest({ email }, { signal });
        }, (result) => {
            setGrant(''); setVerifiedGrant('');
            if ('challenge' in result) setChallenge(result);
            else {
                if (result.status === 'completed') action.clearSession();
                setFinished(result.status === 'accepted' ? 'accepted' : 'completed');
            }
        }, (kind) => {
            if (kind === 'uncertain' || kind === 'unavailable') {
                if (enrollment || recovery || grant) action.clearSession();
                setGrant(''); setVerifiedGrant(''); setUncertain(true);
            }
        });
    };
    if (challenge) return <NativeFactor challenge={challenge} mode={recovery ? 'recovery' : 'enrollment'}
        token={session.token ?? undefined} onDone={leave} onCancel={(reason) => {
            if (!reason) { leave(); return; }
            setChallenge(null); setGrant(''); setVerifiedGrant(''); setUncertain(true);
            action.clearSession(); action.setError(reason);
        }} />;
    return <NativeFrame title={title} error={action.error} pending={action.pending || config.isAuthConfigLoading}>
        {config.authConfigError ? <><p role="alert">{config.authConfigError}</p><Button onClick={config.reloadAuthConfig}>{t('native.retry')}</Button></> :
            !config.isAuthConfigLoading && !permitted ? <p role="alert">{t('native.errors.forbidden')}</p> :
                finished ? <p role="status">{t(finished === 'accepted' ? 'native.reset_sent' : 'native.reset_done')}</p> :
                    uncertain ? null : permitted && <form className="space-y-4" onSubmit={submit}>
                        {(enrollment || recovery) && !grant ? <p role="alert">{t('native.missing_link')}</p> : <>
                            {recovery && <>
                                <p>{t('native.recover_help')}</p>
                                <Field label={t('native.recovery_kind')}>
                                    {(field) => <select {...field} className="w-full border rounded-md bg-background p-2" value={recoveryKind} onChange={(event) => { setPassword(''); setNewPassword(''); setRecoveryKind(event.target.value as typeof recoveryKind); }}>
                                        <option value="factor">{t('native.recover_factor')}</option><option value="password">{t('native.recover_password')}</option>
                                    </select>}
                                </Field>
                                <Field label={t(recoveryEmail ? 'native.primary_grant' : 'native.verified_grant')} help={t('native.grant_help')} required={recoveryEmail}>
                                    {(field) => <Input {...field} type="password" autoComplete="off" value={verifiedGrant} onChange={(event) => setVerifiedGrant(event.target.value)} required={recoveryEmail} />}
                                </Field>
                            </>}
                            {!enrollment && !recovery && !grant ? <Field label={t('native.email')} required>
                                {(field) => <Input {...field} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />}
                            </Field> : recovery && recoveryKind === 'factor' ? <Field label={t('native.password')} required>
                                {(field) => <Input {...field} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />}
                            </Field> : <Field label={t('native.new_password')} help={t('native.password_help')} required>
                                {(field) => <Input {...field} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />}
                            </Field>}
                            <Button type="submit" disabled={action.pending}>{t(!enrollment && !recovery && !grant ? 'native.send_reset' : 'native.continue')}</Button>
                        </>}
                    </form>}
        <Link to="/login" className="block underline" onClick={leave}>{t('native.back_login')}</Link>
    </NativeFrame>;
}
