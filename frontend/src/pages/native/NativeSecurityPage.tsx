import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { resolveNativeRoute } from '@/routing/public';
import { nativeAuthApi, NativeAuthError } from '@/services/nativeAuthApi';
import { applyAuthenticatedSession, clearExplicitLogoutSuppressed, getSessionOwnershipSnapshot, isSessionOwnershipCurrent, useSessionSnapshot } from '@/services/session';
import type { FactorSetupResponse, LocalAuthChallenge, RecentAuthenticationRequest } from '@/types/localAuth.generated';
import { useAuthConfigLoader } from '@/pages/login/useAuthConfigLoader';
import { NativeFrame } from './NativeFrame';
import { NativeFactor } from './NativeFactor';
import { NativeLoginView } from './NativeLoginView';
import { useFragmentCredential } from './useFragmentCredential';
import { useNativeAction } from './useNativeAction';

type Operation = Exclude<RecentAuthenticationRequest['operation'], 'assisted_recovery'>;
type Account = Awaited<ReturnType<typeof nativeAuthApi.account>>;

/** Public route keeps display-once codes visible after credential changes clear the session. */
export default function NativeSecurityPage() {
    const { t } = useTranslation('auth');
    const location = useLocation();
    const navigate = useNavigate();
    const session = useSessionSnapshot();
    const [grant, setGrant] = useFragmentCredential();
    const verifyingEmail = resolveNativeRoute(location.pathname)?.key === 'native-verify-email';
    const [operation, setOperation] = useState<Operation>(verifyingEmail ? 'email_change' : 'password_change');
    const [account, setAccount] = useState<Account | null>(null);
    const [accountError, setAccountError] = useState(false);
    const [retry, setRetry] = useState(0);
    const [password, setPassword] = useState('');
    const [factor, setFactor] = useState('');
    const [method, setMethod] = useState<'totp' | 'recovery_code'>('totp');
    const [newPassword, setNewPassword] = useState('');
    const [email, setEmail] = useState('');
    const [challenge, setChallenge] = useState<{ value: LocalAuthChallenge | FactorSetupResponse; mode: 'enrollment' | 'replacement'; token: string } | null>(null);
    const [notificationFailed, setNotificationFailed] = useState(false);
    const [codes, setCodes] = useState<string[] | null>(null);
    const [completed, setCompleted] = useState(false);
    const [unchanged, setUnchanged] = useState(false);
    const [emailSent, setEmailSent] = useState(false);
    const [uncertain, setUncertain] = useState(false);
    const action = useNativeAction(() => { setPassword(''); setFactor(''); setNewPassword(''); setEmail(''); setCodes(null); setAccount(null); setGrant(''); });
    const config = useAuthConfigLoader({ unavailableServiceMessage: t('native.errors.unavailable'), unavailableConfigMessage: t('native.errors.unavailable') });
    const canManage = resolveCapabilityFlag(session.user?.me_capabilities?.identity, 'can_manage_own_credentials');
    useEffect(() => {
        if (!session.token || !canManage) return;
        const controller = new AbortController();
        const owner = getSessionOwnershipSnapshot();
        void nativeAuthApi.account(session.token, controller.signal).then((value) => {
            if (!controller.signal.aborted && isSessionOwnershipCurrent(owner)) { setAccount(value); setAccountError(false); }
        }).catch(() => { if (!controller.signal.aborted && isSessionOwnershipCurrent(owner)) setAccountError(true); });
        return () => controller.abort();
    }, [session.token, canManage, retry]);
    const leave = () => { action.cancel(); setGrant(''); setPassword(''); setFactor(''); setNewPassword(''); setChallenge(null); setCodes(null); void navigate('/login', { replace: true }); };
    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!account || !session.user || !session.token || action.pending || uncertain) return;
        const token = session.token;
        const targetUser = session.user.id;
        const currentPassword = password;
        const currentFactor = factor;
        const intendedPassword = newPassword;
        const intendedEmail = email;
        setPassword(''); setFactor(''); setNewPassword(''); setUnchanged(false);
        void action.run(async (signal) => {
            const options = { token, signal };
            const proof = await nativeAuthApi.recentAuth({
                password: currentPassword, factor: account.factor_required ? currentFactor : undefined,
                method, target_user_id: targetUser, operation,
                intended_password: operation === 'password_change' ? intendedPassword : undefined,
                intended_email: operation === 'email_change' ? intendedEmail : undefined,
            }, options);
            if (signal.aborted) throw new NativeAuthError('uncertain');
            const body = { recent_auth_proof: proof.proof };
            if (operation === 'password_change') return nativeAuthApi.changePassword({ ...body, password: intendedPassword }, options);
            if (operation === 'email_change') {
                if (verifyingEmail) return nativeAuthApi.confirmEmail({ ...body, grant }, options);
                return nativeAuthApi.changeEmail({ ...body, new_email: intendedEmail }, options);
            }
            if (operation === 'factor_enroll') return nativeAuthApi.enrollFactor(body, options);
            if (operation === 'factor_replace') return nativeAuthApi.replaceFactor(body, options);
            return nativeAuthApi.regenerateCodes(body, options);
        }, (result) => {
            if ('challenge' in result) setChallenge({ value: result, mode: operation === 'factor_enroll' ? 'enrollment' : 'replacement', token });
            else if ('recovery_codes' in result) { action.clearSession(); setNotificationFailed(result.notification_status === 'failed'); setCodes(result.recovery_codes); }
            else if (result.status === 'accepted') setEmailSent(true);
            else if (operation === 'password_change' && result.reauthentication_required === false) setUnchanged(true);
            else { setGrant(''); action.clearSession(); setCompleted(true); }
        }, (kind) => {
            if (kind === 'uncertain' || kind === 'unavailable') { setGrant(''); setUncertain(true); action.clearSession(); }
        });
    };
    if (challenge) return <NativeFactor challenge={challenge.value} mode={challenge.mode} token={challenge.token} onDone={leave} onCancel={(reason) => {
        if (!reason) { leave(); return; }
        setChallenge(null); setGrant(''); setUncertain(true); action.clearSession(); action.setError(reason);
    }} />;
    if (codes) return <NativeFrame title={t('native.backup_title')}>
        <p>{t('native.backup_help')}</p>
        {notificationFailed && <p role="alert">{t('native.notification_failed')}</p>}
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm">{codes.map((code) => <li key={code}>{code}</li>)}</ul>
        <Button onClick={leave}>{t('native.backup_ack')}</Button>
    </NativeFrame>;
    if (completed || uncertain) return <NativeFrame title={t('native.security_title')} error={action.error}>
        {completed && <p role="status">{t('native.changed')}</p>}<Button onClick={leave}>{t('native.back_login')}</Button>
    </NativeFrame>;
    if (config.authConfig?.identity?.mode === 'native' && config.authConfig.password_login_enabled && !session.token) {
        return <NativeLoginView config={config.authConfig} onSession={(response) => {
            clearExplicitLogoutSuppressed();
            const target = applyAuthenticatedSession(response, location.pathname);
            void navigate(target, { replace: true });
        }} />;
    }
    const enabled = config.authConfig?.identity?.mode === 'native' && canManage;
    return <NativeFrame title={t(verifyingEmail ? 'native.email_confirm_title' : 'native.security_title')} pending={action.pending || config.isAuthConfigLoading} error={action.error}>
        {unchanged && <p role="status">{t('native.password_unchanged')}</p>}
        {config.authConfigError ? <><p role="alert">{config.authConfigError}</p><Button onClick={config.reloadAuthConfig}>{t('native.retry')}</Button></> :
            !config.isAuthConfigLoading && !enabled ? <p role="alert">{t('native.errors.forbidden')}</p> :
                accountError ? <><p role="alert">{t('native.errors.unavailable')}</p><Button onClick={() => setRetry((value) => value + 1)}>{t('native.retry')}</Button></> :
                    !account ? <p role="status">{t('native.pending')}</p> :
                        verifyingEmail && !grant ? <p role="alert">{t('native.missing_link')}</p> :
                            emailSent ? <p role="status">{t('native.email_sent')}</p> : <form className="space-y-4" onSubmit={submit}>
                                <p className="text-sm">{t(account.mfa_enabled ? 'native.mfa_enabled' : 'native.mfa_disabled')}</p>
                                {!verifyingEmail && <Field label={t('native.security_action')}>
                                    {(field) => <select {...field} className="w-full rounded-md border bg-background p-2" value={operation} disabled={action.pending} onChange={(event) => { setOperation(event.target.value as Operation); setPassword(''); setFactor(''); setNewPassword(''); setEmail(''); action.setError(null); }}>
                                        <option value="password_change">{t('native.password_change')}</option>
                                        <option value="email_change">{t('native.email_change')}</option>
                                        {config.authConfig?.identity?.factor_management_enabled && <>
                                            {account.mfa_enabled ? <><option value="factor_replace">{t('native.factor_replace')}</option><option value="recovery_codes">{t('native.recovery_codes')}</option></> : <option value="factor_enroll">{t('native.factor_enroll')}</option>}
                                        </>}
                                    </select>}
                                </Field>}
                                {operation === 'password_change' && <Field label={t('native.new_password')} help={t('native.password_help')} required>
                                    {(field) => <Input {...field} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required disabled={action.pending} />}
                                </Field>}
                                {operation === 'email_change' && <Field label={t('native.new_email')} help={verifyingEmail ? t('native.email_confirm_help') : undefined} required>
                                    {(field) => <Input {...field} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={action.pending} />}
                                </Field>}
                                <p className="text-sm">{t('native.recent_help')}</p>
                                <Field label={t('native.password')} required>
                                    {(field) => <Input {...field} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={action.pending} />}
                                </Field>
                                {account.factor_required && <>
                                    <Field label={t('native.factor_method')}>
                                        {(field) => <select {...field} className="w-full border rounded-md bg-background p-2" value={method} onChange={(event) => { setFactor(''); setMethod(event.target.value as typeof method); }} disabled={action.pending}>
                                            <option value="totp">{t('native.totp')}</option><option value="recovery_code">{t('native.recovery_code')}</option>
                                        </select>}
                                    </Field>
                                    <Field label={t(method === 'totp' ? 'native.code' : 'native.recovery_code')} required>
                                        {(field) => <Input {...field} autoComplete="one-time-code" value={factor} onChange={(event) => setFactor(event.target.value)} required disabled={action.pending} />}
                                    </Field>
                                </>}
                                <Button type="submit" disabled={action.pending}>{t('native.confirm_change')}</Button>
                            </form>}
        <p className="text-sm text-muted-foreground">{t('native.recovery_help')}</p>
        <Link className="block underline" to="/settings" onClick={() => { action.cancel(); setGrant(''); }}>{t('native.back_settings')}</Link>
    </NativeFrame>;
}
