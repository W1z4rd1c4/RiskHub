import { Building2, Check, Crown, Shield, User } from 'lucide-react';
import { useId } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { DialogFooter } from '@/components/ui/dialog';
import { InlineMessage } from '@/components/ui/inline-message';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import type { DepartmentSummary } from '@/services/departmentApi';
import type { AccessUserRead, RoleWithPermissions } from '@/types/access';

import { type AccessEditCapabilities, type AccessEditSelection, SCOPE_OPTIONS } from './accessEditModalLogic';
import { LoadingState } from '@/components/ui/state';

type Translate = (key: string, options?: Record<string, unknown>) => string;

function updateSelection(
    setSelection: Dispatch<SetStateAction<AccessEditSelection | null>>,
    patch: Partial<AccessEditSelection>,
) {
    setSelection((current) => (current ? { ...current, ...patch } : current));
}


export function AccessEditLoading({ label }: { label: string }) {
    return (
        <LoadingState className="py-20" label={label} />
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
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                <Shield className="h-4 w-4 text-chart-2" />
                {t('common:labels.role')}
            </label>
            <div className="grid grid-cols-2 gap-2">
                {roles.map((role) => (
                    <button
                        key={role.id}
                        onClick={() => updateSelection(setSelection, { roleId: role.id })}
                        className={`p-3 rounded-xl border text-left transition-all ${selectedRoleId === role.id
                            ? 'bg-accent/10 border-accent'
                            : 'bg-tint/5 border-border hover:bg-tint/10'
                            }`}
                    >
                        <p className={`text-sm font-bold ${selectedRoleId === role.id ? 'text-accent-text' : 'text-foreground'}`}>
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
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-accent-text" />
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
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                    <User className="h-4 w-4 text-success-text" />
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
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                    <Crown className="h-4 w-4 text-warning-text" />
                    {t('access.access_scope', { ns: 'admin' })}
                </label>
                <div className="space-y-2">
                    {SCOPE_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            onClick={() => updateSelection(setSelection, { scope: option.value })}
                            className={`w-full p-3 rounded-xl border text-left transition-all flex items-center gap-3 ${selection.scope === option.value
                                ? 'bg-warning/10 border-warning'
                                : 'bg-tint/5 border-border hover:bg-tint/10'
                                }`}
                        >
                            <div className={`w-6 h-6 rounded flex items-center justify-center ${selection.scope === option.value ? 'bg-warning text-warning-foreground' : 'bg-tint/10 text-muted-foreground'
                                }`}>
                                {selection.scope === option.value && <Check className="h-4 w-4" />}
                            </div>
                            <div>
                                <p className={`text-sm font-bold ${selection.scope === option.value ? 'text-warning-text' : 'text-foreground'}`}>
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
        <>
            {errorKey && (
                <div className="px-6 pb-4">
                    <InlineMessage tone="danger">
                        {errorMessage ?? t(errorKey, { ns: 'errorKeys' })}
                    </InlineMessage>
                </div>
            )}
            <DialogFooter
                extra={(
                    <span className="text-eyebrow flex items-center gap-2">
                        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${hasChanges ? 'bg-warning' : 'bg-muted-foreground'}`} />
                        {hasChanges
                            ? t('access.modal.unsaved_changes', { ns: 'admin' })
                            : t('access.modal.no_changes', { ns: 'admin' })}
                    </span>
                )}
                onCancel={onClose}
                cancelLabel={t('actions.cancel', { ns: 'common' })}
                submitLabel={isSubmitting ? t('loading.generic', { ns: 'common' }) : t('actions.save', { ns: 'common' })}
                submitIcon={<Check aria-hidden="true" />}
                onSubmit={onSubmit}
                submitDisabled={!hasChanges || !isInitialized}
                isSubmitting={isSubmitting}
            />
        </>
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
