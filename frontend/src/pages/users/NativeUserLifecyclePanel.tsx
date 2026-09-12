import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { nativeAdminApi } from '@/services/nativeAdminApi';
import { nativeAuthApi } from '@/services/nativeAuthApi';
import { getSessionOwnershipSnapshot, isSessionOwnershipCurrent, useSessionSnapshot } from '@/services/session';
import type { AccessUserRead } from '@/types/access';
import type { AssistedRecoveryRequest, LocalAccountSecurityResponse, LocalIdentityStatusResponse } from '@/types/localAuth.generated';
import { useNativeAction } from '@/pages/native/useNativeAction';

type Operation = 'resend' | 'cancel' | 'reset' | 'recover' | 'suspend' | 'resume';
export function NativeUserLifecyclePanel({ user, onBusy, onCommitted, onRefresh }: {
    user: AccessUserRead;
    onBusy: (busy: boolean) => void;
    onCommitted: (user: AccessUserRead) => void;
    onRefresh: () => void;
}) {
    const { t } = useTranslation('admin');
    const session = useSessionSnapshot();
    const [status, setStatus] = useState<LocalIdentityStatusResponse | null>(null);
    const [account, setAccount] = useState<LocalAccountSecurityResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [reload, setReload] = useState(0);
    const [operation, setOperation] = useState<Operation | null>(null);
    const [recoveryOperation, setRecoveryOperation] = useState<AssistedRecoveryRequest['operation']>('factor_recovery');
    const [reason, setReason] = useState('');
    const [incident, setIncident] = useState('');
    const [verification, setVerification] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [password, setPassword] = useState('');
    const [factor, setFactor] = useState('');
    const [method, setMethod] = useState<'totp' | 'recovery_code'>('totp');
    const [outcome, setOutcome] = useState<string | null>(null);
    const [uncertain, setUncertain] = useState(false);
    const reasonInput = useRef<HTMLInputElement>(null);
    useEffect(() => { if (operation) reasonInput.current?.focus(); }, [operation]);
    const focus = useRef<HTMLParagraphElement>(null);
    const action = useNativeAction(() => { setStatus(null); setPassword(''); setFactor(''); setOperation(null); setOutcome(null); });
    const pending = action.pending;
    useEffect(() => { onBusy(pending); return () => onBusy(false); }, [pending, onBusy]);
    useEffect(() => { if (outcome || action.error) focus.current?.focus(); }, [outcome, action.error]);
    useEffect(() => {
        if (!session.token) return;
        const controller = new AbortController();
        const owner = getSessionOwnershipSnapshot();
        setLoading(true); setLoadFailed(false);
        void Promise.all([
            nativeAdminApi.status(user.id, { token: session.token, signal: controller.signal }),
            nativeAuthApi.account(session.token, controller.signal),
        ]).then(([nextStatus, nextAccount]) => {
            if (!controller.signal.aborted && isSessionOwnershipCurrent(owner)) { setStatus(nextStatus); setAccount(nextAccount); }
        }).catch(() => {
            if (!controller.signal.aborted && isSessionOwnershipCurrent(owner)) { setStatus(null); setLoadFailed(true); }
        }).finally(() => { if (!controller.signal.aborted && isSessionOwnershipCurrent(owner)) setLoading(false); });
        return () => controller.abort();
    }, [user.id, session.user?.id, session.token, reload]);
    const allowed = (next: Operation) => {
        const caps = user.capabilities;
        if (next === 'resend') return resolveCapabilityFlag(caps, 'can_reissue_invitation');
        if (next === 'cancel') return resolveCapabilityFlag(caps, 'can_cancel_invitation');
        if (next === 'reset') return resolveCapabilityFlag(caps, 'can_request_password_reset');
        if (next === 'recover') return resolveCapabilityFlag(caps, 'can_initiate_recovery') && !resolveCapabilityFlag(caps, 'recovery_offline_required');
        if (next === 'resume') return resolveCapabilityFlag(caps, 'can_resume');
        return user.is_active && resolveCapabilityFlag(caps, 'can_change_active_status');
    };
    const refresh = () => { setReload((value) => value + 1); onRefresh(); };
    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!operation || !allowed(operation) || !status || !account || !session.token || loading || loadFailed || pending || uncertain) return;
        const token = session.token;
        const target = user.id;
        const version = status.authority_version;
        const body = { reason: reason.trim() };
        const recent = { password, factor: factor || undefined, method, target_user_id: target, operation: 'assisted_recovery' as const,
            expected_token_version: version, intended_recovery_operation: recoveryOperation,
            intended_recovery_email: recoveryOperation === 'verified_address_recovery' ? newEmail.trim() : undefined };
        const recovery = { ...body, expected_token_version: version, incident_reference: incident.trim(), verification_method: verification.trim(),
            operation: recoveryOperation, new_email: recoveryOperation === 'verified_address_recovery' ? newEmail.trim() : undefined };
        setPassword(''); setFactor(''); setOutcome(null);
        void action.run(async (signal) => {
            const options = { token, signal };
            if (operation === 'suspend' || operation === 'resume') return nativeAdminApi.setActive(target, operation === 'resume', body.reason, options);
            if (operation === 'resend') return nativeAdminApi.resend(target, body, options);
            if (operation === 'cancel') return nativeAdminApi.cancel(target, body, options);
            if (operation === 'reset') return nativeAdminApi.reset(target, body, options);
            const proof = await nativeAuthApi.recentAuth(recent, options);
            return nativeAdminApi.recover(target, { ...recovery, recent_auth_proof: proof.proof }, options);
        }, (result) => {
            if ('capabilities' in result) onCommitted(result);
            const delivery = 'delivery_status' in result ? ` ${t(`native_users.delivery.${result.delivery_status}`)}` : '';
            setOutcome(t(`native_users.completed.${operation}`) + delivery);
            setOperation(null); setReason(''); setIncident(''); setVerification(''); setNewEmail('');
            refresh();
        }, (kind) => {
            if (kind === 'uncertain' || kind === 'unavailable') { setUncertain(true); setOperation(null); }
            // Refresh stale capability/status without discarding the operator's rationale.
            if (kind === 'forbidden' || kind === 'conflict') refresh();
        });
    };
    return <section className="mt-6 space-y-4 border-t pt-5" aria-busy={loading || pending}>
        <h3 className="font-semibold">{t('native_users.lifecycle')}</h3>
        <p>{user.name} ({user.email})</p>
        {loading && <p role="status">{t('native_users.loading')}</p>}
        {loadFailed && <p role="alert">{t('native_users.status_failed')}</p>}
        {status && !loading && <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt>{t('native_users.enrollment')}</dt><dd>{t(`native_users.states.${status.enrollment_state ?? 'unknown'}`)}</dd>
            <dt>{t('native_users.delivery_label')}</dt><dd>{t(`native_users.delivery.${status.delivery_status ?? 'none'}`)}</dd>
            <dt>{t('native_users.suspension')}</dt><dd>{t(status.local_suspended ? 'native_users.suspended' : 'native_users.not_suspended')}</dd>
            <dt>{t('native_users.recovery')}</dt><dd>{t(status.recovery_pending ? 'native_users.recovery_pending' : 'native_users.no_recovery')}</dd>
        </dl>}
        {outcome && <p ref={focus} tabIndex={-1} role="status">{outcome}</p>}
        {action.error && <p ref={focus} tabIndex={-1} role="alert">{t(`native_users.errors.${action.error}`)}</p>}
        {uncertain && <p role="alert">{t('native_users.unknown_action')}</p>}
        <Button variant="outline" disabled={loading || pending} onClick={refresh}>{t('native_users.refresh_status')}</Button>
        {resolveCapabilityFlag(user.capabilities, 'recovery_offline_required') && <p>{t('native_users.offline_recovery')}</p>}
        {user.capabilities?.active_status_block_reason && <p>{t('native_users.status_blocked')}</p>}
        {!operation && !uncertain && <div className="flex flex-wrap gap-2">{(['resend', 'cancel', 'reset', 'recover', 'suspend', 'resume'] as const).filter(allowed).map((next) =>
            <Button key={next} variant="outline" disabled={loading || loadFailed || !status || pending} onClick={() => { setOperation(next); setOutcome(null); action.setError(null); }}>{t(`native_users.actions.${next}`)}</Button>)}</div>}
        {operation && <form onSubmit={submit} className="space-y-4">
            <p>{t(`native_users.effects.${operation}`, { name: user.name, email: user.email })}</p>
            {!allowed(operation) && <p role="alert">{t('native_users.capability_changed')}</p>}
            <fieldset disabled={pending} className="space-y-4">
                <Field label={t('native_users.reason')} required>{(field) => <Input {...field} ref={reasonInput} value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={2000} />}</Field>
                {operation === 'recover' && <>
                    <p>{t('native_users.verification_help')}</p>
                    <Field label={t('native_users.incident')} required>{(field) => <Input {...field} value={incident} onChange={(event) => setIncident(event.target.value)} required maxLength={255} />}</Field>
                    <Field label={t('native_users.verification')} required>{(field) => <Input {...field} value={verification} onChange={(event) => setVerification(event.target.value)} required maxLength={255} />}</Field>
                    <Field label={t('native_users.recovery_operation')}>{(field) => <select {...field} className="w-full rounded-md border bg-background p-2" value={recoveryOperation} onChange={(event) => { setRecoveryOperation(event.target.value as typeof recoveryOperation); setPassword(''); setFactor(''); }}>
                        {(['factor_recovery', 'credential_and_factor_recovery', 'verified_address_recovery'] as const).map((value) => <option value={value} key={value}>{t(`native_users.operations.${value}`)}</option>)}
                    </select>}</Field>
                    {recoveryOperation === 'verified_address_recovery' && <Field label={t('native_users.new_email')} required>{(field) => <Input {...field} type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} required />}</Field>}
                    <Field label={t('native_users.admin_password')} required>{(field) => <Input {...field} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />}</Field>
                    {account?.mfa_enabled && <>
                        <Field label={t('native_users.factor_method')}>{(field) => <select {...field} className="w-full rounded-md border bg-background p-2" value={method} onChange={(event) => { setMethod(event.target.value as typeof method); setFactor(''); }}><option value="totp">{t('auth:native.totp')}</option><option value="recovery_code">{t('auth:native.recovery_code')}</option></select>}</Field>
                        <Field label={t('native_users.admin_factor')} required>{(field) => <Input {...field} value={factor} onChange={(event) => setFactor(event.target.value)} autoComplete="one-time-code" required />}</Field>
                    </>}
                </>}
                <div className="flex gap-3">
                    <Button type="submit" disabled={!allowed(operation) || loading || loadFailed || uncertain}>{t('native_users.confirm_action')}</Button>
                    <Button type="button" variant="outline" onClick={() => { setOperation(null); setPassword(''); setFactor(''); }}>{t('common:actions.cancel')}</Button>
                </div>
            </fieldset>
        </form>}
    </section>;
}
