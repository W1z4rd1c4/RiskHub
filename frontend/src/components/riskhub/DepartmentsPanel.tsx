import { useState, useEffect, useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building, Plus, Edit, Trash2, RotateCcw, AlertCircle, Users, Activity, Shield } from 'lucide-react';
import { riskHubApi } from '@/services/riskHubApi';
import { accessApi } from '@/services/accessApi';
import { apiClient } from '@/services/apiClient';
import type { DepartmentHubCreate, DepartmentHubUpdate, DepartmentHubRead } from '@/services/riskHubApi';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { riskHubKeys, usersKeys } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { ErrorState, LoadingState } from '@/components/ui/state';
import { DialogBody, DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/hooks';
import { RiskHubFieldError, RiskHubModalActions, RiskHubModalFrame } from './panelPrimitives';
import { riskHubCapabilityEnabled, useRiskHubCapabilities } from './useRiskHubCapabilities';
import { useRiskHubConfigResource } from './useRiskHubConfigResource';

interface DepartmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    department?: DepartmentHubRead | null;
    onSave: (data: DepartmentHubCreate | DepartmentHubUpdate) => Promise<void>;
}

function DepartmentModal({ isOpen, onClose, department, onSave }: DepartmentModalProps) {
    const { t } = useTranslation(['admin', 'common']);
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [managerId, setManagerId] = useState<number | undefined>(undefined);
    const [saving, setSaving] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setName(department?.name || '');
            setCode(department?.code || '');
            setManagerId(department?.manager_id || undefined);
            setErrorKey(null);
        }
    }, [isOpen, department]);

    // Fetch users for manager selection
    const { data: users } = useQuery({
        queryKey: usersKeys.accessDepartmentManagers(department?.id),
        queryFn: () => accessApi.listAccessUsers({ department_id: department!.id }),
        enabled: isOpen && Boolean(department?.id),
    });
    const managerOptions = (users ?? [])
        .filter((user) => user.is_active && user.department_id === department?.id)
        .map((user) => ({ value: user.id.toString(), label: `${user.name} (${user.email})` }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorKey(null);
        setSaving(true);
        try {
            if (department) {
                // Update - explicitly send null if manager is cleared to remove assignment
                await onSave({
                    name,
                    code: code || undefined,
                    manager_id: managerId === undefined ? null : managerId
                });
            } else {
                // Create
                await onSave({
                    name,
                    code: code || undefined,
                });
            }
            onClose();
        } catch (err: unknown) {
            setErrorKey(apiClient.toUiMessageKey(err));
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <RiskHubModalFrame onClose={onClose} isBusy={saving} title={department ? t('admin:departments_panel.modal.edit_title') : t('admin:departments_panel.modal.new_title')}>
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                <DialogBody>
                    <Field label={t('admin:departments_panel.modal.fields.department_name')} required>
                        {(field) => (
                            <Input
                                {...field}
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('admin:departments_panel.modal.placeholders.department_name')}
                                required
                            />
                        )}
                    </Field>

                    <Field
                        label={t('admin:departments_panel.modal.fields.code_optional')}
                        help={t('admin:departments_panel.modal.hints.code')}
                    >
                        {(field) => (
                            <Input
                                {...field}
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                                className="font-mono"
                                placeholder={t('admin:departments_panel.modal.placeholders.code')}
                            />
                        )}
                    </Field>

                    {department && (
                        <Field label={t('common:labels.owner')}>
                            {(field) => (
                                <ThemedSelect
                                    {...field}
                                    value={managerId?.toString() ?? ''}
                                    onValueChange={(v) => setManagerId(v ? Number(v) : undefined)}
                                    placeholder={t('admin:departments_panel.modal.placeholders.no_manager')}
                                    allowEmpty
                                    emptyLabel={t('admin:departments_panel.modal.placeholders.no_manager')}
                                    className="w-full"
                                    options={managerOptions}
                                />
                            )}
                        </Field>
                    )}

                    <RiskHubFieldError errorKey={errorKey} />
                </DialogBody>
                <RiskHubModalActions
                    onCancel={onClose}
                    saveLabel={t('admin:departments_panel.modal.save_department')}
                    saving={saving}
                    savingLabel={t('admin:departments_panel.modal.saving')}
                />
            </form>
        </RiskHubModalFrame>
    );
}

export function DepartmentsPanel() {
    const { t } = useTranslation(['admin', 'common']);
    const deleteTitleId = useId();
    const deleteDescriptionId = useId();
    const showInactiveId = useId();
    const panel = useRiskHubConfigResource<DepartmentHubRead, DepartmentHubCreate, DepartmentHubUpdate>({
        queryKey: riskHubKeys.departments(),
        load: (showInactive) => riskHubApi.getDepartments(showInactive),
        create: (data) => riskHubApi.createDepartment(data),
        update: (id, data) => riskHubApi.updateDepartment(Number(id), data),
        delete: (id) => riskHubApi.deleteDepartment(Number(id)),
        restore: (id) => riskHubApi.restoreDepartment(Number(id)),
        itemId: (item) => item.id,
        panelCapabilityKey: 'departments',
    });
    const { data: riskHubCapabilities } = useRiskHubCapabilities();
    const canCreate = riskHubCapabilityEnabled(riskHubCapabilities?.departments, 'can_create');

    if (panel.isLoading) {
        return <LoadingState label={t('common:loading.departments')} />;
    }
    // GAP-C-11: a failed load never renders as an empty department list.
    if (panel.error && !panel.hasData) {
        return <ErrorState onRetry={panel.retry} isRetrying={panel.isFetching} />;
    }

    const deleteBlocked = Boolean(panel.deleteConfirm && (
        panel.deleteConfirm.user_count > 0
        || panel.deleteConfirm.risk_count > 0
        || panel.deleteConfirm.control_count > 0
        || panel.deleteConfirm.kri_count > 0
        || panel.deleteConfirm.vendor_count > 0
        || panel.deleteConfirm.pending_orphan_count > 0
    ));

    return (
        <div className="space-y-4">
            {panel.error ? (
                <ErrorState variant="banner" onRetry={panel.retry} isRetrying={panel.isFetching} />
            ) : null}
            {panel.actionErrorKey && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                    <AlertCircle className="h-4 w-4" />
                    {t(panel.actionErrorKey, { ns: 'errorKeys' })}
                </div>
            )}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Building className="h-5 w-5 text-accent" />
                    <h3 className="text-lg font-semibold text-foreground">{t('admin:departments_panel.title')}</h3>
                </div>

                <div className="flex items-center gap-4">
                    <label htmlFor={showInactiveId} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                            id={showInactiveId}
                            type="checkbox"
                            checked={panel.showInactive}
                            onChange={(e) => panel.setShowInactive(e.target.checked)}
                            className="rounded border-tint/20 bg-tint/5 text-accent focus:ring-accent"
                        />
                        {t('admin:departments_panel.show_deleted')}
                    </label>

                    {canCreate ? (
                        <button
                            onClick={panel.openCreate}
                            className="flex items-center gap-2 px-3 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent-hover transition-colors"
                        >
                            <Plus className="h-4 w-4" />
                            {t('admin:departments_panel.add_department')}
                        </button>
                    ) : null}
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border">
                            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">{t('admin:departments_panel.columns.name_code')}</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">{t('admin:departments_panel.columns.manager')}</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">{t('admin:departments_panel.columns.users')}</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">{t('admin:departments_panel.columns.risks')}</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">{t('admin:departments_panel.columns.controls')}</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">{t('common:labels.status')}</th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">{t('common:labels.actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {panel.items.map((dept) => {
                            const canUpdate = resolveCapabilityFlag(dept.capabilities, 'can_update');
                            const canDelete = resolveCapabilityFlag(dept.capabilities, 'can_delete');
                            const canRestore = resolveCapabilityFlag(dept.capabilities, 'can_restore');
                            return (
                            <tr
                                key={dept.id}
                                className={cn(
                                    "border-b border-border hover:bg-tint/5 transition-colors",
                                    !dept.is_active && "opacity-50"
                                )}
                            >
                                <td className="py-3 px-4">
                                    <div className="font-medium text-foreground">{dept.name}</div>
                                    {dept.code && (
                                        <code className="text-xs text-muted-foreground font-mono">{dept.code}</code>
                                    )}
                                </td>
                                <td className="py-3 px-4">
                                    {dept.manager_name ? (
                                        <div className="text-sm text-foreground">{dept.manager_name}</div>
                                    ) : (
                                        <span className="text-xs text-muted-foreground italic">{t('labels.no_manager')}</span>
                                    )}
                                </td>
                                <td className="py-3 px-4 text-center">
                                    <div className="flex items-center justify-center gap-1.5 px-2 py-0.5 bg-tint/5 rounded-full inline-flex">
                                        <Users className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-xs text-foreground">{dept.user_count}</span>
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-center">
                                    <div className="flex items-center justify-center gap-1.5 px-2 py-0.5 bg-warning/10 rounded-full inline-flex">
                                        <Activity className="h-3 w-3 text-warning-text" aria-hidden="true" />
                                        <span className="text-xs text-warning-text">{dept.risk_count}</span>
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-center">
                                    <div className="flex items-center justify-center gap-1.5 px-2 py-0.5 bg-success/10 rounded-full inline-flex">
                                        <Shield className="h-3 w-3 text-success-text" aria-hidden="true" />
                                        <span className="text-xs text-success-text">{dept.control_count}</span>
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-center">
                                    {dept.is_active ? (
                                        <span className="px-2 py-0.5 bg-success/10 text-success-text rounded-full text-xs border border-success/20">
                                            {t('admin:departments_panel.badges.active')}
                                        </span>
                                    ) : (
                                        <span className="px-2 py-0.5 bg-destructive/10 text-destructive rounded-full text-xs border border-destructive/20">
                                            {t('admin:departments_panel.badges.deleted')}
                                        </span>
                                    )}
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => panel.openEdit(dept)}
                                            className={cn(
                                                "p-1.5 rounded transition-colors",
                                                canUpdate
                                                    ? "text-muted-foreground hover:text-foreground hover:bg-tint/10"
                                                    : "text-muted-foreground opacity-50 cursor-not-allowed"
                                            )}
                                            disabled={!canUpdate}
                                            title={t('common:actions.edit')}
                                            aria-label={t('common:actions.edit')}
                                        >
                                            <Edit className="h-4 w-4" aria-hidden="true" />
                                        </button>

                                        {canDelete && (
                                            <button
                                                onClick={() => panel.requestDelete(dept)}
                                                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                                                title={t('common:actions.delete')}
                                                aria-label={t('common:actions.delete')}
                                            >
                                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        )}

                                        {canRestore && (
                                            <button
                                                onClick={() => panel.handleRestore(dept)}
                                                className="p-1.5 text-muted-foreground hover:text-success-text hover:bg-success/10 rounded transition-colors"
                                                title={t('admin:departments_panel.actions.restore')}
                                                aria-label={t('admin:departments_panel.actions.restore')}
                                            >
                                                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Create/Edit Modal */}
            <DepartmentModal
                isOpen={panel.modalOpen}
                onClose={panel.closeModal}
                department={panel.editingItem}
                onSave={panel.handleSave}
            />

            {/* Delete Confirmation */}
            {panel.deleteConfirm && (
                <DialogShell
                    isOpen
                    onClose={panel.closeDelete}
                    titleId={deleteTitleId}
                    descriptionIds={[deleteDescriptionId]}
                    role="alertdialog"
                    size="sm"
                >
                    <DialogHeader title={t('confirmations.delete_department')} icon={Trash2} tone="danger" />
                    <DialogBody className="text-sm text-muted-foreground">
                        <p id={deleteDescriptionId}>
                            {t('admin:departments_panel.delete_confirm', { name: panel.deleteConfirm.name })}
                        </p>
                        {deleteBlocked && (
                            <div className="space-y-1 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                                <div className="flex items-center gap-2 font-bold">
                                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                                    {t('admin:departments_panel.delete_blocked_title')}
                                </div>
                                <ul className="ml-1 list-inside list-disc">
                                    {panel.deleteConfirm.user_count > 0 && <li>{t('admin:departments_panel.linked_counts.users', { count: panel.deleteConfirm.user_count })}</li>}
                                    {panel.deleteConfirm.risk_count > 0 && <li>{t('admin:departments_panel.linked_counts.risks', { count: panel.deleteConfirm.risk_count })}</li>}
                                    {panel.deleteConfirm.control_count > 0 && <li>{t('admin:departments_panel.linked_counts.controls', { count: panel.deleteConfirm.control_count })}</li>}
                                    {panel.deleteConfirm.kri_count > 0 && <li>{t('admin:departments_panel.linked_counts.kris', { count: panel.deleteConfirm.kri_count })}</li>}
                                    {panel.deleteConfirm.vendor_count > 0 && <li>{t('admin:departments_panel.linked_counts.vendors', { count: panel.deleteConfirm.vendor_count })}</li>}
                                    {panel.deleteConfirm.pending_orphan_count > 0 && <li>{t('admin:departments_panel.linked_counts.pending_orphans', { count: panel.deleteConfirm.pending_orphan_count })}</li>}
                                </ul>
                            </div>
                        )}
                    </DialogBody>
                    <DialogFooter
                        cancelLabel={t('common:actions.cancel')}
                        intent="destructive"
                        submitLabel={deleteBlocked ? undefined : t('common:actions.delete')}
                        onSubmit={() => void panel.handleDelete()}
                    />
                </DialogShell>
            )}
        </div>
    );
}
