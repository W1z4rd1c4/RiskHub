import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, Building, Plus, Edit, Users, Activity, Shield } from 'lucide-react';
import { riskHubApi } from '@/services/riskHubApi';
import { accessApi } from '@/services/accessApi';
import { apiClient } from '@/services/apiClient';
import type { DepartmentHubCreate, DepartmentHubUpdate, DepartmentHubRead } from '@/services/riskHubApi';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { riskHubKeys, usersKeys } from '@/lib/queryKeys';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { RowActionButton } from '@/components/tables/RowActionButton';
import { RowRestoreButton } from '@/components/tables/RowRestoreButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardHeader } from '@/components/ui/card';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import { DialogBody } from '@/components/ui/dialog';
import { InlineMessage } from '@/components/ui/inline-message';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { translateUiMessage, useFormat, useTranslation, type SafeTFunction } from '@/i18n/hooks';
import { RiskHubFieldError, RiskHubModalActions, RiskHubModalFrame, RiskHubShowArchivedToggle } from './panelPrimitives';
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

/**
 * Why a department cannot be archived yet (linked records), or `undefined`.
 * Shown as the Archive action's disabled reason (GAP-B-03), so the blocked
 * archive is explained in place instead of in a confirmation without a confirm.
 */
function archiveBlockedReason(dept: DepartmentHubRead, t: SafeTFunction): string | undefined {
    const linked = [
        dept.user_count > 0 ? t('admin:departments_panel.linked_counts.users', { count: dept.user_count }) : null,
        dept.risk_count > 0 ? t('admin:departments_panel.linked_counts.risks', { count: dept.risk_count }) : null,
        dept.control_count > 0 ? t('admin:departments_panel.linked_counts.controls', { count: dept.control_count }) : null,
        dept.kri_count > 0 ? t('admin:departments_panel.linked_counts.kris', { count: dept.kri_count }) : null,
        dept.vendor_count > 0 ? t('admin:departments_panel.linked_counts.vendors', { count: dept.vendor_count }) : null,
        dept.pending_orphan_count > 0
            ? t('admin:departments_panel.linked_counts.pending_orphans', { count: dept.pending_orphan_count })
            : null,
    ].filter((entry): entry is string => entry !== null);
    return linked.length > 0
        ? t('admin:departments_panel.archive_blocked_reason', { items: linked.join(', ') })
        : undefined;
}

export function DepartmentsPanel() {
    const { t } = useTranslation(['admin', 'common']);
    const format = useFormat();
    const panel = useRiskHubConfigResource<DepartmentHubRead, DepartmentHubCreate, DepartmentHubUpdate>({
        queryKey: riskHubKeys.departments(),
        load: (showInactive) => riskHubApi.getDepartments(showInactive),
        create: (data) => riskHubApi.createDepartment(data),
        update: (id, data) => riskHubApi.updateDepartment(Number(id), data),
        delete: (id) => riskHubApi.deleteDepartment(Number(id)),
        restore: (id) => riskHubApi.restoreDepartment(Number(id)),
        itemId: (item) => item.id,
        itemName: (item) => item.name,
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

    const archiveTarget = panel.deleteConfirm;

    return (
        <div className="space-y-4">
            {panel.error ? (
                <ErrorState variant="banner" onRetry={panel.retry} isRetrying={panel.isFetching} />
            ) : null}
            {panel.actionErrorKey && !archiveTarget && (
                <InlineMessage tone="danger">{translateUiMessage(t, panel.actionErrorKey)}</InlineMessage>
            )}
            <CardHeader
                className="mb-0"
                icon={Building}
                title={t('admin:departments_panel.title')}
                actions={(
                    <>
                        <RiskHubShowArchivedToggle
                            checked={panel.showInactive}
                            onCheckedChange={panel.setShowInactive}
                            label={t('admin:departments_panel.show_deleted')}
                        />
                        {canCreate ? (
                            <Button variant="accent" onClick={panel.openCreate}>
                                <Plus aria-hidden="true" />
                                {t('admin:departments_panel.add_department')}
                            </Button>
                        ) : null}
                    </>
                )}
            />

            {panel.items.length === 0 ? (
                <EmptyState title={t('admin:departments_panel.empty')} testId="departments-empty" />
            ) : (
                <Table density="compact" regionLabel={t('admin:departments_panel.title')}>
                    <THead>
                        <TR>
                            <TH>{t('admin:departments_panel.columns.name_code')}</TH>
                            <TH>{t('admin:departments_panel.columns.manager')}</TH>
                            <TH align="center">{t('admin:departments_panel.columns.users')}</TH>
                            <TH align="center">{t('admin:departments_panel.columns.risks')}</TH>
                            <TH align="center">{t('admin:departments_panel.columns.controls')}</TH>
                            <TH align="center">{t('common:labels.status')}</TH>
                            <TH align="right">{t('common:labels.actions')}</TH>
                        </TR>
                    </THead>
                    <TBody>
                        {panel.items.map((dept) => {
                            const canUpdate = resolveCapabilityFlag(dept.capabilities, 'can_update');
                            const canDelete = resolveCapabilityFlag(dept.capabilities, 'can_delete');
                            const canRestore = resolveCapabilityFlag(dept.capabilities, 'can_restore');
                            return (
                                <TR key={dept.id} data-archived={dept.is_active ? undefined : 'true'}>
                                    <TD>
                                        <div className="font-medium text-foreground">{dept.name}</div>
                                        {dept.code && (
                                            <code className="text-xs text-muted-foreground font-mono">{dept.code}</code>
                                        )}
                                    </TD>
                                    <TD>
                                        {dept.manager_name ? (
                                            <div className="text-sm text-foreground">{dept.manager_name}</div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground italic">{t('labels.no_manager')}</span>
                                        )}
                                    </TD>
                                    <TD align="center">
                                        <Badge tone="neutral" icon={Users}>{format.number(dept.user_count)}</Badge>
                                    </TD>
                                    <TD align="center">
                                        <Badge tone="warning" icon={Activity}>{format.number(dept.risk_count)}</Badge>
                                    </TD>
                                    <TD align="center">
                                        <Badge tone="success" icon={Shield}>{format.number(dept.control_count)}</Badge>
                                    </TD>
                                    <TD align="center">
                                        {dept.is_active ? (
                                            <Badge tone="success">{t('admin:departments_panel.badges.active')}</Badge>
                                        ) : (
                                            <Badge tone="neutral">{t('admin:departments_panel.badges.deleted')}</Badge>
                                        )}
                                    </TD>
                                    <TD align="right">
                                        <div className="flex items-center justify-end gap-1">
                                            {/* GAP-B-03: an edit the user cannot make stays visible with its reason. */}
                                            <RowActionButton
                                                icon={Edit}
                                                label={t('common:actions.edit_named', { name: dept.name })}
                                                onClick={() => panel.openEdit(dept)}
                                                disabledReason={canUpdate
                                                    ? undefined
                                                    : t('admin:departments_panel.actions.edit_disabled', { name: dept.name })}
                                            />

                                            {canDelete && (
                                                <RowActionButton
                                                    icon={Archive}
                                                    tone="danger"
                                                    label={t('common:actions.archive_named', { name: dept.name })}
                                                    onClick={() => panel.requestDelete(dept)}
                                                    disabledReason={archiveBlockedReason(dept, t)}
                                                />
                                            )}

                                            {canRestore && (
                                                <RowRestoreButton
                                                    itemName={dept.name}
                                                    onClick={() => panel.handleRestore(dept)}
                                                />
                                            )}
                                        </div>
                                    </TD>
                                </TR>
                            );
                        })}
                    </TBody>
                </Table>
            )}

            {/* Create/Edit Modal */}
            <DepartmentModal
                isOpen={panel.modalOpen}
                onClose={panel.closeModal}
                department={panel.editingItem}
                onSave={panel.handleSave}
            />

            {/* PM-1 / D10: departments are soft-deleted and restorable, so this is
                an archive; the API takes no reason. Busy and errors stay in the dialog. */}
            <ConfirmDialog
                isOpen={archiveTarget !== null}
                onClose={panel.closeDelete}
                onConfirm={() => void panel.handleDelete()}
                intent="archive"
                title={t('confirmations.archive_department')}
                message={archiveTarget
                    ? t('admin:departments_panel.archive_confirm', { name: archiveTarget.name })
                    : undefined}
                isLoading={panel.isDeleting}
                errorText={archiveTarget ? translateUiMessage(t, panel.actionErrorKey) || null : null}
            />
        </div>
    );
}
