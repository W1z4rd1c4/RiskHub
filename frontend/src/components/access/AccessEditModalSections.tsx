import { Building2, Check, Crown, Loader2, Shield, User, X } from 'lucide-react';
import { useId } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import type { DepartmentSummary } from '@/services/departmentApi';
import type { AccessUserRead, RoleWithPermissions } from '@/types/access';

import { type AccessEditCapabilities, type AccessEditSelection, SCOPE_OPTIONS } from './accessEditModalLogic';

type Translate = (key: string, options?: Record<string, unknown>) => string;

function updateSelection(
    setSelection: Dispatch<SetStateAction<AccessEditSelection | null>>,
    patch: Partial<AccessEditSelection>,
) {
    setSelection((current) => (current ? { ...current, ...patch } : current));
}

export function AccessEditModalHeader({ title, userName, onClose }: { title: string; userName: string; onClose: () => void }) {
    const { t } = useTranslation('common');
    return (
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
            <div>
                <h3 className="text-xl font-bold text-white tracking-tight">{title}</h3>
                <p className="text-xs text-muted-foreground font-medium">{userName}</p>
            </div>
            <button
                type="button"
                onClick={onClose}
                aria-label={t('actions.close')}
                className="p-2 glass rounded-lg text-muted-foreground hover:text-white transition-colors"
            >
                <X className="h-5 w-5" />
            </button>
        </div>
    );
}

export function AccessEditLoading({ label }: { label: string }) {
    return (
        <div className="py-20 flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-10 w-10 text-accent animate-spin" />
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
        </div>
    );
}

export function AccessEditIdentitySection({ selection, setSelection, capabilities, t }: {
    selection: AccessEditSelection;
    setSelection: Dispatch<SetStateAction<AccessEditSelection | null>>;
    capabilities: AccessEditCapabilities;
    t: Translate;
}) {
    const nameId = useId();
    const emailId = useId();
    return <section className="space-y-3">
        <h3 className="font-semibold">{t('user_new.personal_information', { ns: 'admin' })}</h3>
        <label className="block" htmlFor={nameId}>{t('user_new.full_name', { ns: 'admin' })}</label>
        <input id={nameId} className="w-full rounded-md border bg-background p-2" value={selection.name} disabled={!capabilities.canEditName} onChange={(event) => updateSelection(setSelection, { name: event.target.value })} />
        <label className="block" htmlFor={emailId}>{t('user_new.email_address', { ns: 'admin' })}</label>
        <input id={emailId} type="email" className="w-full rounded-md border bg-background p-2" value={selection.email} disabled={!capabilities.canEditEmail} onChange={(event) => updateSelection(setSelection, { email: event.target.value })} />
        {capabilities.directoryOwned && <p className="text-sm">{t('native_users.directory_owned', { ns: 'admin' })}</p>}
        {capabilities.verifiedEmail && <p className="text-sm">{t('native_users.verified_email', { ns: 'admin' })}</p>}
    </section>;
}

export function AccessEditRoleSection({
    roles,
    selectedRoleId,
    setSelection,
    t,
}: {
    roles: RoleWithPermissions[];
    selectedRoleId: number | null;
    setSelection: Dispatch<SetStateAction<AccessEditSelection | null>>;
    t: Translate;
}) {
    return (
        <div className="space-y-3">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Shield className="h-4 w-4 text-purple-400" />
                {t('common:labels.role')}
            </label>
            <div className="grid grid-cols-2 gap-2">
                {roles.map((role) => (
                    <button
                        key={role.id}
                        onClick={() => updateSelection(setSelection, { roleId: role.id })}
                        className={`p-3 rounded-xl border text-left transition-all ${selectedRoleId === role.id
                            ? 'bg-purple-500/10 border-purple-500'
                            : 'bg-white/5 border-white/5 hover:bg-white/10'
                            }`}
                    >
                        <p className={`text-sm font-bold ${selectedRoleId === role.id ? 'text-purple-400' : 'text-white'}`}>
                            {role.display_name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{t('access.modal.permissions_count', { ns: 'admin', count: role.permissions.length })}</p>
                    </button>
                ))}
            </div>
        </div>
    );
}

export function AccessEditBusinessSections({
    departments,
    allUsers,
    selection,
    setSelection,
    t,
}: {
    departments: DepartmentSummary[];
    allUsers: AccessUserRead[];
    selection: AccessEditSelection;
    setSelection: Dispatch<SetStateAction<AccessEditSelection | null>>;
    t: Translate;
}) {
    return (
        <>
            <div className="space-y-3">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-blue-400" />
                    {t('common:labels.department')}
                </label>
                <ThemedSelect
                    value={selection.departmentId?.toString() ?? ''}
                    onValueChange={(value) => updateSelection(setSelection, { departmentId: value ? Number(value) : null })}
                    placeholder={t('access.table.no_department', { ns: 'admin' })}
                    allowEmpty
                    emptyLabel={t('access.table.no_department', { ns: 'admin' })}
                    className="w-full"
                    options={departments.map((department) => ({ value: department.id.toString(), label: department.name }))}
                />
            </div>

            <div className="space-y-3">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <User className="h-4 w-4 text-emerald-400" />
                    {t('access.modal.reports_to', { ns: 'admin' })}
                </label>
                <ThemedSelect
                    value={selection.managerId?.toString() ?? ''}
                    onValueChange={(value) => updateSelection(setSelection, { managerId: value ? Number(value) : null })}
                    placeholder={t('access.modal.no_manager_top_level', { ns: 'admin' })}
                    allowEmpty
                    emptyLabel={t('access.modal.no_manager_top_level', { ns: 'admin' })}
                    className="w-full"
                    options={allUsers.map((candidate) => ({ value: candidate.id.toString(), label: candidate.name }))}
                />
            </div>

            <div className="space-y-3">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Crown className="h-4 w-4 text-amber-400" />
                    {t('access.access_scope', { ns: 'admin' })}
                </label>
                <div className="space-y-2">
                    {SCOPE_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            onClick={() => updateSelection(setSelection, { scope: option.value })}
                            className={`w-full p-3 rounded-xl border text-left transition-all flex items-center gap-3 ${selection.scope === option.value
                                ? 'bg-amber-500/10 border-amber-500'
                                : 'bg-white/5 border-white/5 hover:bg-white/10'
                                }`}
                        >
                            <div className={`w-6 h-6 rounded flex items-center justify-center ${selection.scope === option.value ? 'bg-amber-500 text-white' : 'bg-white/10 text-slate-600'
                                }`}>
                                {selection.scope === option.value && <Check className="h-4 w-4" />}
                            </div>
                            <div>
                                <p className={`text-sm font-bold ${selection.scope === option.value ? 'text-amber-400' : 'text-white'}`}>
                                    {t(option.labelKey)}
                                </p>
                                <p className="text-[10px] text-muted-foreground">{t(option.descriptionKey)}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
}

export function AccessEditFooter({
    hasChanges,
    isSubmitting,
    isInitialized,
    errorKey,
    errorMessage,
    onClose,
    onSubmit,
    t,
}: {
    hasChanges: boolean;
    isSubmitting: boolean;
    isInitialized: boolean;
    errorKey: string | null;
    errorMessage: string | null;
    onClose: () => void;
    onSubmit: () => void;
    t: Translate;
}) {
    return (
        <div className="p-6 border-t border-white/5 bg-white/5">
            {errorKey && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-[10px] font-bold uppercase tracking-wider">
                    {errorMessage ?? t(errorKey, { ns: 'errorKeys' })}
                </div>
            )}

            <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest flex items-center gap-2">
                    {hasChanges ? (
                        <>
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            {t('access.modal.unsaved_changes', { ns: 'admin' })}
                        </>
                    ) : (
                        <>
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                            {t('access.modal.no_changes', { ns: 'admin' })}
                        </>
                    )}
                </span>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
                    >
                        {t('actions.cancel', { ns: 'common' })}
                    </button>
                    <button
                        onClick={onSubmit}
                        disabled={!hasChanges || isSubmitting || !isInitialized}
                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-accent text-accent-foreground text-xs font-black uppercase tracking-widest rounded-xl hover:bg-accent-hover transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg active:scale-95"
                    >
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        {isSubmitting ? t('loading.generic', { ns: 'common' }) : t('actions.save', { ns: 'common' })}
                    </button>
                </div>
            </div>
        </div>
    );
}

export function AccessEditFormSections({
    capabilities,
    roles,
    departments,
    allUsers,
    selection,
    setSelection,
    t,
}: {
    capabilities: AccessEditCapabilities;
    roles: RoleWithPermissions[];
    departments: DepartmentSummary[];
    allUsers: AccessUserRead[];
    selection: AccessEditSelection;
    setSelection: Dispatch<SetStateAction<AccessEditSelection | null>>;
    t: Translate;
}) {
    return (
        <>
            {(capabilities.canEditPlatformFields || capabilities.directoryOwned || capabilities.verifiedEmail) && (
                <AccessEditIdentitySection capabilities={capabilities} selection={selection} setSelection={setSelection} t={t} />
            )}
            {capabilities.canEditRole && roles.length > 0 && (
                <AccessEditRoleSection
                    roles={roles}
                    selectedRoleId={selection.roleId}
                    setSelection={setSelection}
                    t={t}
                />
            )}
            {capabilities.canEditBusinessFields && (
                <AccessEditBusinessSections
                    departments={departments}
                    allUsers={allUsers}
                    selection={selection}
                    setSelection={setSelection}
                    t={t}
                />
            )}
        </>
    );
}
