import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { nativeAuthApi, type NativeErrorKind } from '@/services/nativeAuthApi';
import type { TokenResponse } from '@/services/authApi';
import type { FactorSetupResponse, LocalAuthChallenge } from '@/types/localAuth.generated';
import { NativeFrame } from './NativeFrame';
import { useNativeAction } from './useNativeAction';

export function NativeFactor({ challenge, mode, token, onSession, onDone, onCancel }: {
    challenge: LocalAuthChallenge | FactorSetupResponse;
    mode: 'login' | 'enrollment' | 'replacement' | 'recovery';
    token?: string;
    onSession?: (session: TokenResponse) => void;
    onDone: () => void;
    onCancel: (reason?: NativeErrorKind | 'expired') => void;
}) {
    const { t } = useTranslation('auth');
    const [setup, setSetup] = useState<FactorSetupResponse | null>('provisioning_uri' in challenge ? challenge : null);
    const [code, setCode] = useState('');
    const [method, setMethod] = useState<'totp' | 'recovery_code'>('totp');
    const [notificationFailed, setNotificationFailed] = useState(false);
    const [codes, setCodes] = useState<string[] | null>(null);
    const [expiresAt] = useState(() => Date.now() + (challenge.expires_in ?? 300) * 1000);
    const action = useNativeAction(onCancel);
    const cancelAction = action.cancel;
    const isLogin = mode === 'login' && 'status' in challenge && challenge.status === 'mfa_required';
    useEffect(() => {
        if (codes) return;
        const timer = window.setTimeout(() => {
            cancelAction(); setSetup(null); setCode(''); onCancel('expired');
        }, Math.max(0, expiresAt - Date.now()));
        return () => window.clearTimeout(timer);
    }, [expiresAt, codes, cancelAction, onCancel]);
    const abandon = () => { action.cancel(); setCode(''); setSetup(null); setCodes(null); onCancel(); };
    const failed = (kind: NativeErrorKind) => {
        if (kind === 'uncertain' || kind === 'unavailable' || kind === 'forbidden' || kind === 'limited') {
            setSetup(null); onCancel(kind);
        }
    };
    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (action.pending) return;
        const body = { challenge: setup?.challenge ?? challenge.challenge, code, method };
        setCode('');
        void action.run(async (signal) => {
            const options = { signal, token };
            if (isLogin) return nativeAuthApi.verify(body, options);
            if (mode === 'replacement') return nativeAuthApi.confirmReplacement(body, options);
            if (mode === 'recovery') return nativeAuthApi.recoveryConfirm(body, options);
            return nativeAuthApi.confirm(body, options);
        }, (result) => {
            setSetup(null);
            if ('access_token' in result) onSession?.(result);
            else {
                if (token) action.clearSession();
                setNotificationFailed(result.notification_status === 'failed');
                setCodes(result.recovery_codes);
            }
        }, failed);
    };
    if (codes) return <NativeFrame title={t('native.backup_title')}>
        <p>{t('native.backup_help')}</p>
        {notificationFailed && <p role="alert">{t('native.notification_failed')}</p>}
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm">{codes.map((value) => <li key={value}>{value}</li>)}</ul>
        <Button onClick={() => { setCodes(null); onDone(); }}>{t('native.backup_ack')}</Button>
    </NativeFrame>;
    return <NativeFrame title={t(isLogin ? 'native.factor_title' : 'native.setup_title')} error={action.error} pending={action.pending}>
        <>
            {!isLogin && !setup ? <>
                <p>{t('native.setup_help')}</p>
                <Button disabled={action.pending} onClick={() => void action.run(
                    (signal) => nativeAuthApi.setup({ challenge: challenge.challenge }, { signal, token }), setSetup, failed,
                )}>{t('native.setup_start')}</Button>
            </> : <form className="space-y-4" onSubmit={submit}>
                {setup && <Field label={t('native.setup_key')} help={t('native.setup_manual')}>
                    {(field) => <Input {...field} readOnly value={new URL(setup.provisioning_uri).searchParams.get('secret') ?? ''} autoComplete="off" />}
                </Field>}
                {isLogin && <Field label={t('native.factor_method')}>
                    {(field) => <select {...field} className="w-full rounded-md border bg-background p-2" value={method} disabled={action.pending} onChange={(event) => { setCode(''); setMethod(event.target.value as typeof method); }}>
                        <option value="totp">{t('native.totp')}</option>
                        <option value="recovery_code">{t('native.recovery_code')}</option>
                    </select>}
                </Field>}
                <Field label={t(method === 'totp' ? 'native.code' : 'native.recovery_code')} required>
                    {(field) => <Input {...field} value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" inputMode={method === 'totp' ? 'numeric' : 'text'} required disabled={action.pending} />}
                </Field>
                <Button type="submit" disabled={action.pending}>{t('native.verify')}</Button>
            </form>}
            <Button variant="outline" onClick={abandon}>{t('native.cancel')}</Button>
        </>
    </NativeFrame>;
}
