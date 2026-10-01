import { useState, useEffect, useId } from 'react';
import { Palette, Plus, Edit, Trash2, RotateCcw } from 'lucide-react';
import { ColorSwatch } from '@/components/ui/ColorSwatch';
import { DialogBody, DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { riskHubApi } from '@/services/riskHubApi';
import { apiClient } from '@/services/apiClient';
import type { RiskType, RiskTypeCreate, RiskTypeUpdate } from '@/services/riskHubApi';
import { cn } from '@/lib/utils';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { riskHubKeys } from '@/lib/queryKeys';
import { useTranslation } from '@/i18n/hooks';
import { RiskHubFieldError, RiskHubModalActions, RiskHubModalFrame } from './panelPrimitives';
import { riskHubCapabilityEnabled, useRiskHubCapabilities } from './useRiskHubCapabilities';
import { useRiskHubConfigResource } from './useRiskHubConfigResource';

interface RiskTypeModalProps {
    isOpen: boolean;
    onClose: () => void;
    riskType?: RiskType | null;
    onSave: (data: RiskTypeCreate | RiskTypeUpdate) => Promise<void>;
}

function RiskTypeModal({ isOpen, onClose, riskType, onSave }: RiskTypeModalProps) {
    const { t } = useTranslation(['admin', 'common']);
    const [code, setCode] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState('#64748b');
    const [sortOrder, setSortOrder] = useState(0);
    const [saving, setSaving] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setCode(riskType?.code || '');
            setDisplayName(riskType?.display_name || '');
            setDescription(riskType?.description || '');
            setColor(riskType?.color || '#64748b');
            setSortOrder(riskType?.sort_order || 0);
            setErrorKey(null);
        }
    }, [isOpen, riskType]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorKey(null);
        setSaving(true);
        try {
            if (riskType) {
                // Update existing
                await onSave({ display_name: displayName, description, color, sort_order: sortOrder });
            } else {
                // Create new
                await onSave({ code, display_name: displayName, description, color, sort_order: sortOrder });
            }
            onClose();
        } catch (err) {
            setErrorKey(apiClient.toUiMessageKey(err));
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <RiskHubModalFrame onClose={onClose} isBusy={saving} title={riskType ? t('admin:risk_types_panel.modal.edit_title') : t('admin:risk_types_panel.modal.new_title')}>
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                <DialogBody>
                    {!riskType && (
                        <Field
                            label={t('admin:risk_types_panel.modal.fields.code')}
                            help={t('admin:risk_types_panel.modal.hints.code')}
                            required
                        >
                            {(field) => (
                                <Input
                                    {...field}
                                    type="text"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                    placeholder={t('admin:risk_types_panel.modal.placeholders.code')}
                                    required
                                />
                            )}
                        </Field>
                    )}

                    <Field label={t('admin:risk_types_panel.modal.fields.display_name')} required>
                        {(field) => (
                            <Input
                                {...field}
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder={t('admin:risk_types_panel.modal.placeholders.display_name')}
                                required
                            />
                        )}
                    </Field>

                    <Field label={t('common:labels.description')}>
                        {(field) => (
                            <Textarea
                                {...field}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder={t('admin:risk_types_panel.modal.placeholders.description')}
                                rows={3}
                            />
                        )}
                    </Field>

                    <div className="flex gap-4">
                        <Field label={t('admin:risk_types_panel.modal.fields.color')} group className="flex-1">
                            {(field) => (
                                <div className="flex items-center gap-2" role="group" aria-labelledby={field['aria-labelledby']}>
                                    <input
                                        type="color"
                                        aria-labelledby={field['aria-labelledby']}
                                        value={color}
                                        onChange={(e) => setColor(e.target.value)}
                                        className="h-10 w-10 cursor-pointer rounded"
                                    />
                                    <Input
                                        type="text"
                                        aria-labelledby={field['aria-labelledby']}
                                        value={color}
                                        onChange={(e) => setColor(e.target.value)}
                                        className="flex-1 font-mono"
                                        pattern="^#[0-9a-fA-F]{6}$"
                                    />
                                </div>
                            )}
                        </Field>

                        <Field label={t('admin:risk_types_panel.modal.fields.sort_order')} className="w-24">
                            {(field) => (
                                <Input
                                    {...field}
                                    type="number"
                                    value={sortOrder}
                                    onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                                />
                            )}
                        </Field>
                    </div>

                    <RiskHubFieldError errorKey={errorKey} />
                </DialogBody>
                <RiskHubModalActions
                    onCancel={onClose}
                    saving={saving}
                    savingLabel={t('admin:risk_types_panel.modal.saving')}
                />
            </form>
        </RiskHubModalFrame>
    );
}

export function RiskTypesPanel() {
    const { t } = useTranslation(['admin', 'common']);
    const deleteTitleId = useId();
    const deleteDescriptionId = useId();
    const showDeletedId = useId();
    const panel = useRiskHubConfigResource<RiskType, RiskTypeCreate, RiskTypeUpdate>({
        queryKey: riskHubKeys.riskTypes(),
        load: (showInactive) => riskHubApi.getRiskTypes(showInactive),
        create: (data) => riskHubApi.createRiskType(data),
        update: (id, data) => riskHubApi.updateRiskType(Number(id), data),
        delete: (id) => riskHubApi.deleteRiskType(Number(id)),
        restore: (id) => riskHubApi.restoreRiskType(Number(id)),
        itemId: (item) => item.id,
        panelCapabilityKey: 'risk_types',
    });
    const { data: riskHubCapabilities } = useRiskHubCapabilities();
    const canCreate = riskHubCapabilityEnabled(riskHubCapabilities?.risk_types, 'can_create');

    if (panel.isLoading) {
        return <div className="text-muted-foreground text-center py-8">{t('common:loading.risk_types')}</div>;
    }

    if (panel.error) {
        return <div className="text-destructive text-center py-8">{t('errors.failed_to_load_risk_types')}</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Palette className="h-5 w-5 text-accent" />
                    <h3 className="text-lg font-semibold text-foreground">{t('admin:risk_types_panel.title')}</h3>
                </div>

                <div className="flex items-center gap-4">
                    <label htmlFor={showDeletedId} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                            id={showDeletedId}
                            type="checkbox"
                            checked={panel.showInactive}
                            onChange={(e) => panel.setShowInactive(e.target.checked)}
                            className="rounded border-border bg-background text-accent focus:ring-accent"
                        />
                        {t('admin:risk_types_panel.show_deleted')}
                    </label>

                    {canCreate ? (
                        <button
                            onClick={panel.openCreate}
                            className="flex items-center gap-2 px-3 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent-hover transition-colors"
                        >
                            <Plus className="h-4 w-4" />
                            {t('admin:risk_types_panel.add_type')}
                        </button>
                    ) : null}
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border">
                            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">{t('admin:risk_types_panel.columns.color')}</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">{t('admin:risk_types_panel.columns.code')}</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">{t('admin:risk_types_panel.columns.display_name')}</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">{t('common:labels.description')}</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">{t('admin:risk_types_panel.columns.risks')}</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">{t('common:labels.status')}</th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">{t('common:labels.actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {panel.items.map((type) => {
                            const canUpdate = resolveCapabilityFlag(type.capabilities, 'can_update');
                            const canDelete = resolveCapabilityFlag(type.capabilities, 'can_delete');
                            const canRestore = resolveCapabilityFlag(type.capabilities, 'can_restore');

                            return (
                            <tr
                                key={type.id}
                                className={cn(
                                    "border-b border-border hover:bg-muted/50 transition-colors",
                                    !type.is_active && "opacity-50"
                                )}
                            >
                                <td className="py-3 px-4">
                                    <ColorSwatch color={type.color} className="h-6 w-6" />
                                </td>
                                <td className="py-3 px-4">
                                    <code className="text-sm font-mono text-foreground">{type.code}</code>
                                </td>
                                <td className="py-3 px-4 text-foreground font-medium">{type.display_name}</td>
                                <td className="py-3 px-4 text-muted-foreground text-sm max-w-xs truncate">
                                    {type.description || '—'}
                                </td>
                                <td className="py-3 px-4 text-center">
                                    <span className="px-2 py-0.5 bg-muted rounded-full text-xs text-foreground">
                                        {type.risk_count}
                                    </span>
                                </td>
                                <td className="py-3 px-4 text-center">
                                    {type.is_system ? (
                                        <span className="px-2 py-0.5 bg-info/10 text-accent-text rounded-full text-xs">
                                            {t('admin:risk_types_panel.badges.system')}
                                        </span>
                                    ) : type.is_active ? (
                                        <span className="px-2 py-0.5 bg-success/10 text-success-text rounded-full text-xs">
                                            {t('admin:risk_types_panel.badges.active')}
                                        </span>
                                    ) : (
                                        <span className="px-2 py-0.5 bg-destructive/10 text-destructive rounded-full text-xs">
                                            {t('admin:risk_types_panel.badges.deleted')}
                                        </span>
                                    )}
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        {canUpdate ? (
                                            <button
                                                onClick={() => panel.openEdit(type)}
                                                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                                                title={t('common:actions.edit')}
                                                aria-label={t('common:actions.edit')}
                                            >
                                                <Edit className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        ) : null}

                                        {canDelete && (
                                            <button
                                                onClick={() => panel.requestDelete(type)}
                                                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                                                title={t('common:actions.delete')}
                                                aria-label={t('common:actions.delete')}
                                            >
                                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        )}

                                        {canRestore && (
                                            <button
                                                onClick={() => panel.handleRestore(type)}
                                                className="p-1.5 text-muted-foreground hover:text-success-text hover:bg-success/10 rounded transition-colors"
                                                title={t('admin:risk_types_panel.actions.restore')}
                                                aria-label={t('admin:risk_types_panel.actions.restore')}
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
            <RiskTypeModal
                isOpen={panel.modalOpen}
                onClose={panel.closeModal}
                riskType={panel.editingItem}
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
                    <DialogHeader title={t('confirmations.delete_risk_type')} icon={Trash2} tone="danger" />
                    <DialogBody className="text-sm text-muted-foreground">
                        <p id={deleteDescriptionId}>
                            {t('admin:risk_types_panel.delete_confirm', { name: panel.deleteConfirm.display_name })}
                            {panel.deleteConfirm.risk_count > 0 && (
                                <span className="mt-2 block text-warning-text">
                                    {t('admin:risk_types_panel.delete_warning', { count: panel.deleteConfirm.risk_count })}
                                </span>
                            )}
                        </p>
                        <RiskHubFieldError errorKey={panel.actionErrorKey} />
                    </DialogBody>
                    <DialogFooter
                        cancelLabel={t('common:actions.cancel')}
                        intent="destructive"
                        submitLabel={t('common:actions.delete')}
                        onSubmit={() => void panel.handleDelete()}
                    />
                </DialogShell>
            )}
        </div>
    );
}
