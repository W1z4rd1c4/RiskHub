import { useState, useEffect } from 'react';
import { Archive, Palette, Plus, Edit } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { RowActionButton } from '@/components/tables/RowActionButton';
import { RowRestoreButton } from '@/components/tables/RowRestoreButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardHeader } from '@/components/ui/card';
import { ColorSwatch } from '@/components/ui/ColorSwatch';
import { DialogBody } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { riskHubApi } from '@/services/riskHubApi';
import { apiClient } from '@/services/apiClient';
import type { RiskType, RiskTypeCreate, RiskTypeUpdate } from '@/services/riskHubApi';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { riskHubKeys } from '@/lib/queryKeys';
import { translateUiMessage, useFormat, useTranslation } from '@/i18n/hooks';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import { RiskHubFieldError, RiskHubModalActions, RiskHubModalFrame, RiskHubShowArchivedToggle } from './panelPrimitives';
import { riskHubCapabilityEnabled, useRiskHubCapabilities } from './useRiskHubCapabilities';
import { useRiskHubConfigResource } from './useRiskHubConfigResource';
import { DEFAULT_RISK_TYPE_COLOR } from '@/hooks/useRiskHubConfig';

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
    const [color, setColor] = useState(DEFAULT_RISK_TYPE_COLOR);
    const [sortOrder, setSortOrder] = useState(0);
    const [saving, setSaving] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setCode(riskType?.code || '');
            setDisplayName(riskType?.display_name || '');
            setDescription(riskType?.description || '');
            setColor(riskType?.color || DEFAULT_RISK_TYPE_COLOR);
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
                                        className="h-10 w-10 cursor-pointer rounded-lg border border-input bg-transparent focus-ring"
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
    const format = useFormat();
    const panel = useRiskHubConfigResource<RiskType, RiskTypeCreate, RiskTypeUpdate>({
        queryKey: riskHubKeys.riskTypes(),
        load: (showInactive) => riskHubApi.getRiskTypes(showInactive),
        create: (data) => riskHubApi.createRiskType(data),
        update: (id, data) => riskHubApi.updateRiskType(Number(id), data),
        delete: (id) => riskHubApi.deleteRiskType(Number(id)),
        restore: (id) => riskHubApi.restoreRiskType(Number(id)),
        itemId: (item) => item.id,
        itemName: (item) => item.display_name,
        panelCapabilityKey: 'risk_types',
    });
    const { data: riskHubCapabilities } = useRiskHubCapabilities();
    const canCreate = riskHubCapabilityEnabled(riskHubCapabilities?.risk_types, 'can_create');

    // DS-17 / GAP-C-11: shared loading and error (with retry) states.
    if (panel.isLoading) {
        return <LoadingState label={t('common:loading.risk_types')} />;
    }

    if (panel.error && !panel.hasData) {
        return (
            <ErrorState
                message={t('errors.failed_to_load_risk_types')}
                onRetry={panel.retry}
                isRetrying={panel.isFetching}
            />
        );
    }

    const archiveTarget = panel.deleteConfirm;

    return (
        <div className="space-y-4">
            {panel.error ? (
                <ErrorState variant="banner" onRetry={panel.retry} isRetrying={panel.isFetching} />
            ) : null}
            <CardHeader
                className="mb-0"
                icon={Palette}
                title={t('admin:risk_types_panel.title')}
                actions={(
                    <>
                        <RiskHubShowArchivedToggle
                            checked={panel.showInactive}
                            onCheckedChange={panel.setShowInactive}
                            label={t('admin:risk_types_panel.show_deleted')}
                        />
                        {canCreate ? (
                            <Button variant="accent" onClick={panel.openCreate}>
                                <Plus aria-hidden="true" />
                                {t('admin:risk_types_panel.add_type')}
                            </Button>
                        ) : null}
                    </>
                )}
            />

            {panel.items.length === 0 ? (
                <EmptyState title={t('admin:risk_types_panel.empty')} testId="risk-types-empty" />
            ) : (
                <Table density="compact" regionLabel={t('admin:risk_types_panel.title')}>
                    <THead>
                        <TR>
                            <TH>{t('admin:risk_types_panel.columns.color')}</TH>
                            <TH>{t('admin:risk_types_panel.columns.code')}</TH>
                            <TH>{t('admin:risk_types_panel.columns.display_name')}</TH>
                            <TH>{t('common:labels.description')}</TH>
                            <TH align="center">{t('admin:risk_types_panel.columns.risks')}</TH>
                            <TH align="center">{t('common:labels.status')}</TH>
                            <TH align="right">{t('common:labels.actions')}</TH>
                        </TR>
                    </THead>
                    <TBody>
                        {panel.items.map((type) => {
                            const canUpdate = resolveCapabilityFlag(type.capabilities, 'can_update');
                            const canDelete = resolveCapabilityFlag(type.capabilities, 'can_delete');
                            const canRestore = resolveCapabilityFlag(type.capabilities, 'can_restore');

                            return (
                                <TR key={type.id} data-archived={type.is_active ? undefined : 'true'}>
                                    <TD>
                                        <ColorSwatch color={type.color} className="h-6 w-6" />
                                    </TD>
                                    <TD>
                                        <code className="text-sm font-mono text-foreground">{type.code}</code>
                                    </TD>
                                    <TD className="font-medium text-foreground">{type.display_name}</TD>
                                    <TD className="max-w-xs truncate text-sm text-muted-foreground">
                                        {type.description || '—'}
                                    </TD>
                                    <TD align="center">
                                        <Badge tone="neutral">{format.number(type.risk_count)}</Badge>
                                    </TD>
                                    <TD align="center">
                                        {type.is_system ? (
                                            <Badge tone="info">{t('admin:risk_types_panel.badges.system')}</Badge>
                                        ) : type.is_active ? (
                                            <Badge tone="success">{t('admin:risk_types_panel.badges.active')}</Badge>
                                        ) : (
                                            <Badge tone="neutral">{t('admin:risk_types_panel.badges.deleted')}</Badge>
                                        )}
                                    </TD>
                                    <TD align="right">
                                        <div className="flex items-center justify-end gap-1">
                                            {/* GAP-B-03: an edit the user cannot make stays visible with its reason. */}
                                            <RowActionButton
                                                icon={Edit}
                                                label={t('common:actions.edit_named', { name: type.display_name })}
                                                onClick={() => panel.openEdit(type)}
                                                disabledReason={canUpdate
                                                    ? undefined
                                                    : t('admin:risk_types_panel.actions.edit_disabled', { name: type.display_name })}
                                            />

                                            {canDelete && (
                                                <RowActionButton
                                                    icon={Archive}
                                                    tone="danger"
                                                    label={t('common:actions.archive_named', { name: type.display_name })}
                                                    onClick={() => panel.requestDelete(type)}
                                                />
                                            )}

                                            {canRestore && (
                                                <RowRestoreButton
                                                    itemName={type.display_name}
                                                    onClick={() => panel.handleRestore(type)}
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
            <RiskTypeModal
                isOpen={panel.modalOpen}
                onClose={panel.closeModal}
                riskType={panel.editingItem}
                onSave={panel.handleSave}
            />

            {/* PM-1 / D10: risk types are soft-deleted and restorable, so this is an
                archive; the API takes no reason. Busy and errors stay in the dialog. */}
            <ConfirmDialog
                isOpen={archiveTarget !== null}
                onClose={panel.closeDelete}
                onConfirm={() => void panel.handleDelete()}
                intent="archive"
                title={t('confirmations.archive_risk_type')}
                message={archiveTarget
                    ? [
                        t('admin:risk_types_panel.archive_confirm', { name: archiveTarget.display_name }),
                        archiveTarget.risk_count > 0
                            ? t('admin:risk_types_panel.delete_warning', { count: archiveTarget.risk_count })
                            : '',
                    ].filter(Boolean).join('\n\n')
                    : undefined}
                isLoading={panel.isDeleting}
                errorText={archiveTarget ? translateUiMessage(t, panel.actionErrorKey) || null : null}
            />
        </div>
    );
}
