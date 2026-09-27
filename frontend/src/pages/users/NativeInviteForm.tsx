import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDirtyTaskGuard } from '@/hooks/useDirtyTaskGuard';
import { useTranslation } from '@/i18n/hooks';
import { accessApi } from '@/services/accessApi';
import { departmentApi, type DepartmentSummary } from '@/services/departmentApi';
import { userApi } from '@/services/userApi';
import { nativeAdminApi } from '@/services/nativeAdminApi';
import { getSessionOwnershipSnapshot, isSessionOwnershipCurrent, useSessionSnapshot } from '@/services/session';
import type { InvitationResponse } from '@/types/localAuth.generated';
import type { RoleWithPermissions } from '@/types/access';
import { useNativeAction } from '@/pages/native/useNativeAction';
import { selectSafeDefaultRole } from './userNewRoleDefaults';

type Manager = { id: number; name: string; email: string };
export function NativeInviteForm() {
    const { t } = useTranslation('admin');
    const session = useSessionSnapshot();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [roleId, setRoleId] = useState<number | null>(null);
    const [departmentId, setDepartmentId] = useState<number | null>(null);
    const [managerId, setManagerId] = useState<number | null>(null);
    const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
    const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
    const [managers, setManagers] = useState<Manager[]>([]);
    const [managerQuery, setManagerQuery] = useState('');
    const [managerPending, setManagerPending] = useState(false);
    const [managerError, setManagerError] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [retry, setRetry] = useState(0);
    const [result, setResult] = useState<InvitationResponse | null>(null);
    const [uncertain, setUncertain] = useState(false);
    const notice = useRef<HTMLParagraphElement>(null);
    const action = useNativeAction(() => { setName(''); setEmail(''); setResult(null); setManagers([]); setManagerQuery(''); setManagerId(null); setRoleId(null); setDepartmentId(null); setUncertain(false); });
    const guard = useDirtyTaskGuard({ currentSnapshot: JSON.stringify({ name, email, roleId, departmentId, managerId }), busy: action.pending, enabled: !result && !uncertain });
    const normalizedQuery = managerQuery.trim().toLowerCase();
    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();
        const owner = getSessionOwnershipSnapshot();
        setLoading(true); setLoadError(false);
        void Promise.all([accessApi.listAccessRoles({ signal: controller.signal }), departmentApi.getDepartments({ signal: controller.signal })]).then(([nextRoles, nextDepartments]) => {
            if (cancelled || !isSessionOwnershipCurrent(owner)) return;
            setRoles(nextRoles); setDepartments(nextDepartments);
            setRoleId((current) => current ?? selectSafeDefaultRole(nextRoles)?.id ?? null);
        }).catch(() => { if (!cancelled && isSessionOwnershipCurrent(owner)) setLoadError(true); })
            .finally(() => { if (!cancelled && isSessionOwnershipCurrent(owner)) setLoading(false); });
        return () => { cancelled = true; controller.abort(); };
    }, [session.user?.id, retry]);
    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();
        const owner = getSessionOwnershipSnapshot();
        setManagerPending(true); setManagerError(false);
        void userApi.listVisibleUsers({ q: normalizedQuery || undefined, limit: 50 }, { signal: controller.signal }).then((users) => {
            if (!cancelled && isSessionOwnershipCurrent(owner)) setManagers(users);
        }).catch(() => { if (!cancelled && isSessionOwnershipCurrent(owner)) { setManagers([]); setManagerError(true); } })
            .finally(() => { if (!cancelled && isSessionOwnershipCurrent(owner)) setManagerPending(false); });
        return () => { cancelled = true; controller.abort(); };
    }, [normalizedQuery, session.user?.id, retry]);
    useEffect(() => { if (result || action.error) notice.current?.focus(); }, [result, action.error]);
    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!session.token || loading || loadError || action.pending || uncertain || result) return;
        const token = session.token;
        void action.run((signal) => nativeAdminApi.invite({ name: name.trim(), email: email.trim(), role_id: roleId,
            department_id: departmentId, manager_id: managerId }, { token, signal }), setResult,
        (kind) => { if (kind === 'uncertain' || kind === 'unavailable' || kind === 'forbidden') setUncertain(true); });
    };
    if (result) return <section className="glass-card space-y-4 p-6">
        <p ref={notice} tabIndex={-1} role="status">{t('native_users.created', { name, email })}</p>
        <p role={result.delivery_status === 'failed' ? 'alert' : 'status'}>{t(`native_users.delivery.${result.delivery_status}`)}</p>
        <p>{t('native_users.recipient_chooses_password')}</p>
        <Link className="underline" to="/users" state={{ nativeInvitation: { ...result, name, email } }}>{t('native_users.view_users')}</Link>
    </section>;
    return <><form onSubmit={submit} className="glass-card space-y-5 p-6" aria-busy={action.pending || loading}>
        <p>{t('native_users.recipient_chooses_password')}</p>
        {action.error && <p ref={notice} tabIndex={-1} role="alert">{t(`native_users.errors.${action.error}`)}</p>}
        {loadError && <p role="alert">{t('native_users.options_failed')}</p>}
        {(loadError || managerError) && <Button type="button" variant="outline" onClick={() => setRetry((value) => value + 1)}>{t('native_users.retry')}</Button>}
        {uncertain ? <Link className="block underline" to="/users">{t('native_users.check_users_before_retry')}</Link> : <>
            <Field label={t('user_new.full_name')} required>{(field) => <Input {...field} value={name} onChange={(event) => setName(event.target.value)} required maxLength={255} disabled={action.pending} />}</Field>
            <Field label={t('native_users.email')} required>{(field) => <Input {...field} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="off" disabled={action.pending} />}</Field>
            <Field label={t('user_new.platform_role')} required>{(field) => <select {...field} className="w-full rounded-md border bg-background p-2" value={roleId ?? ''} onChange={(event) => setRoleId(Number(event.target.value))} required disabled={loading || action.pending}>
                <option value="" disabled>{t('native_users.choose_role')}</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.display_name}</option>)}
            </select>}</Field>
            <Field label={t('native_users.department')}>{(field) => <select {...field} className="w-full rounded-md border bg-background p-2" value={departmentId ?? ''} onChange={(event) => setDepartmentId(event.target.value ? Number(event.target.value) : null)} disabled={loading || action.pending}>
                <option value="">{t('native_users.no_assignment')}</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>}</Field>
            <Field label={t('native_users.manager_search')}>{(field) => <Input {...field} value={managerQuery} disabled={action.pending} onChange={(event) => {
                const value = event.target.value;
                if (value.trim().toLowerCase() !== normalizedQuery) { setManagerId(null); setManagers([]); }
                setManagerQuery(value);
            }} />}</Field>
            {managerError && <p role="alert">{t('native_users.manager_failed')}</p>}
            <Field label={t('native_users.manager')}>{(field) => <select {...field} className="w-full rounded-md border bg-background p-2" value={managerId ?? ''} onChange={(event) => setManagerId(event.target.value ? Number(event.target.value) : null)} disabled={managerPending || managerError || action.pending}>
                <option value="">{t('native_users.no_assignment')}</option>{managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name} ({manager.email})</option>)}
            </select>}</Field>
            <Button type="submit" disabled={loading || loadError || action.pending}>{t('native_users.create_account')}</Button>
        </>}
    </form>{guard.confirmationDialog}</>;
}
