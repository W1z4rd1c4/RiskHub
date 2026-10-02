import { Building2, Check, Crown, Shield, User } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';

import { DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { InlineMessage } from '@/components/ui/inline-message';
import { Input } from '@/components/ui/input';
import { RadioGroup } from '@/components/ui/radio-group';
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

/** A field label with its decorative leading icon. */
function IconLabel({ icon: Icon, className, children }: { icon: typeof Shield; className: string; children: string }) {
    return (
        <span className="inline-flex items-center gap-2">
            <Icon aria-hidden="true" className={className} />
            {children}
        </span>
    );
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
    return <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">{t('user_new.personal_information', { ns: 'admin' })}</h3>
        <Field label={t('user_new.full_name', { ns: 'admin' })}>
            {(field) => <Input {...field} value={selection.name} disabled={!capabilities.canEditName} onChange={(event) => updateSelection(setSelection, { name: event.target.value })} />}
        </Field>
        <Field label={t('user_new.email_address', { ns: 'admin' })}>
            {(field) => <Input {...field} type="email" value={selection.email} disabled={!capabilities.canEditEmail} onChange={(event) => updateSelection(setSelection, { email: event.target.value })} />}
        </Field>
        {capabilities.directoryOwned && <p className="text-sm text-muted-foreground">{t('native_users.directory_owned', { ns: 'admin' })}</p>}
        {capabilities.verifiedEmail && <p className="text-sm text-muted-foreground">{t('native_users.verified_email', { ns: 'admin' })}</p>}
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
        <Field
            group
            label={<IconLabel icon={Shield} className="h-4 w-4 text-chart-2">{t('common:labels.role')}</IconLabel>}
        >
            {(field) => (
                // AX-04 / GAP-D-16: the role choice is a named radio group, so the selected
                // role is announced (it used to be a row of unlabelled toggle-looking buttons).
                <RadioGroup
                    {...field}
                    variant="card"
                    className="grid grid-cols-2 gap-2 space-y-0"
                    value={selectedRoleId?.toString() ?? ''}
                    onValueChange={(value) => updateSelection(setSelection, { roleId: Number(value) })}
                    options={roles.map((role) => ({
                        value: role.id.toString(),
                        label: role.display_name,
                        description: t('access.modal.permissions_count', { ns: 'admin', count: role.permissions.length }),
                    }))}
                />
            )}
        </Field>
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
            <Field label={<IconLabel icon={Building2} className="h-4 w-4 text-accent-text">{t('common:labels.department')}</IconLabel>}>
                {(field) => (
                    <ThemedSelect
                        {...field}
                        value={selection.departmentId?.toString() ?? ''}
                        onValueChange={(value) => updateSelection(setSelection, { departmentId: value ? Number(value) : null })}
                        placeholder={t('access.table.no_department', { ns: 'admin' })}
                        allowEmpty
                        emptyLabel={t('access.table.no_department', { ns: 'admin' })}
                        className="w-full"
                        options={departments.map((department) => ({ value: department.id.toString(), label: department.name }))}
                    />
                )}
            </Field>

            <Field label={<IconLabel icon={User} className="h-4 w-4 text-success-text">{t('access.modal.reports_to', { ns: 'admin' })}</IconLabel>}>
                {(field) => (
                    <ThemedSelect
                        {...field}
                        value={selection.managerId?.toString() ?? ''}
                        onValueChange={(value) => updateSelection(setSelection, { managerId: value ? Number(value) : null })}
                        placeholder={t('access.modal.no_manager_top_level', { ns: 'admin' })}
                        allowEmpty
                        emptyLabel={t('access.modal.no_manager_top_level', { ns: 'admin' })}
                        className="w-full"
                        options={allUsers.map((candidate) => ({ value: candidate.id.toString(), label: candidate.name }))}
                    />
                )}
            </Field>

            <Field
                group
                label={<IconLabel icon={Crown} className="h-4 w-4 text-warning-text">{t('access.access_scope', { ns: 'admin' })}</IconLabel>}
            >
                {(field) => (
                    <RadioGroup
                        {...field}
                        variant="card"
                        value={selection.scope}
                        onValueChange={(scope) => updateSelection(setSelection, { scope })}
                        options={SCOPE_OPTIONS.map((option) => ({
                            value: option.value,
                            label: t(option.labelKey),
                            description: t(option.descriptionKey),
                        }))}
                    />
                )}
            </Field>
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
