import { useState, useEffect } from 'react';
import { Palette, Plus, Edit, Trash2, RotateCcw } from 'lucide-react';
import { ColorSwatch } from '@/components/ui/ColorSwatch';
import { riskHubApi } from '@/services/riskHubApi';
import { apiClient } from '@/services/apiClient';
import type { RiskType, RiskTypeCreate, RiskTypeUpdate } from '@/services/riskHubApi';
import { cn } from '@/lib/utils';
import { resolveCapabilityFlag } from '@/lib/capabilities';
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
        <RiskHubModalFrame title={riskType ? t('admin:risk_types_panel.modal.edit_title') : t('admin:risk_types_panel.modal.new_title')}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {!riskType && (
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin:risk_types_panel.modal.fields.code')}</label>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent"
                                placeholder={t('admin:risk_types_panel.modal.placeholders.code')}
                                required
                            />
                            <p className="text-xs text-slate-500 mt-1">{t('admin:risk_types_panel.modal.hints.code')}</p>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin:risk_types_panel.modal.fields.display_name')}</label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent"
                            placeholder={t('admin:risk_types_panel.modal.placeholders.display_name')}
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">{t('common:labels.description')}</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent"
                            placeholder={t('admin:risk_types_panel.modal.placeholders.description')}
                            rows={3}
                        />
                    </div>

                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin:risk_types_panel.modal.fields.color')}</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={color}
                                    onChange={(e) => setColor(e.target.value)}
                                    className="w-10 h-10 rounded cursor-pointer"
                                />
                                <input
                                    type="text"
                                    value={color}
                                    onChange={(e) => setColor(e.target.value)}
                                    className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                    pattern="^#[0-9a-fA-F]{6}$"
                                />
                            </div>
                        </div>

                        <div className="w-24">
                            <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin:risk_types_panel.modal.fields.sort_order')}</label>
                            <input
                                type="number"
                                value={sortOrder}
                                onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-accent"
                            />
                        </div>
                    </div>

                    <RiskHubFieldError errorKey={errorKey} />
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
    const panel = useRiskHubConfigResource<RiskType, RiskTypeCreate, RiskTypeUpdate>({
        queryKey: ['riskTypes'],
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
        return <div className="text-slate-400 text-center py-8">{t('common:loading.risk_types')}</div>;
    }

    if (panel.error) {
        return <div className="text-red-400 text-center py-8">{t('errors.failed_to_load_risk_types')}</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Palette className="h-5 w-5 text-accent" />
                    <h3 className="text-lg font-semibold text-white">{t('admin:risk_types_panel.title')}</h3>
                </div>

                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-400">
                        <input
                            type="checkbox"
                            checked={panel.showInactive}
                            onChange={(e) => panel.setShowInactive(e.target.checked)}
                            className="rounded border-white/20 bg-white/5 text-accent focus:ring-accent"
                        />
                        {t('admin:risk_types_panel.show_deleted')}
                    </label>

                    {canCreate ? (
                        <button
                            onClick={panel.openCreate}
                            className="flex items-center gap-2 px-3 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
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
                        <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('admin:risk_types_panel.columns.color')}</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('admin:risk_types_panel.columns.code')}</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('admin:risk_types_panel.columns.display_name')}</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('common:labels.description')}</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">{t('admin:risk_types_panel.columns.risks')}</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">{t('common:labels.status')}</th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">{t('common:labels.actions')}</th>
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
                                    "border-b border-white/5 hover:bg-white/5 transition-colors",
                                    !type.is_active && "opacity-50"
                                )}
                            >
                                <td className="py-3 px-4">
                                    <ColorSwatch color={type.color} className="h-6 w-6" />
                                </td>
                                <td className="py-3 px-4">
                                    <code className="text-sm font-mono text-slate-300">{type.code}</code>
                                </td>
                                <td className="py-3 px-4 text-white font-medium">{type.display_name}</td>
                                <td className="py-3 px-4 text-slate-400 text-sm max-w-xs truncate">
                                    {type.description || '—'}
                                </td>
                                <td className="py-3 px-4 text-center">
                                    <span className="px-2 py-0.5 bg-white/10 rounded-full text-xs text-slate-300">
                                        {type.risk_count}
                                    </span>
                                </td>
                                <td className="py-3 px-4 text-center">
                                    {type.is_system ? (
                                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full text-xs">
                                            {t('admin:risk_types_panel.badges.system')}
                                        </span>
                                    ) : type.is_active ? (
                                        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full text-xs">
                                            {t('admin:risk_types_panel.badges.active')}
                                        </span>
                                    ) : (
                                        <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-xs">
                                            {t('admin:risk_types_panel.badges.deleted')}
                                        </span>
                                    )}
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        {canUpdate ? (
                                            <button
                                                onClick={() => panel.openEdit(type)}
                                                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                                                title={t('common:actions.edit')}
                                                aria-label={t('common:actions.edit')}
                                            >
                                                <Edit className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        ) : null}

                                        {canDelete && (
                                            <button
                                                onClick={() => panel.requestDelete(type)}
                                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                title={t('common:actions.delete')}
                                                aria-label={t('common:actions.delete')}
                                            >
                                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        )}

                                        {canRestore && (
                                            <button
                                                onClick={() => panel.handleRestore(type)}
                                                className="p-1.5 text-slate-400 hover:text-green-400 hover:bg-green-500/10 rounded transition-colors"
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-white/10 shadow-2xl rounded-2xl w-full max-w-sm p-6">
                        <h3 className="text-lg font-bold text-white mb-2">{t('confirmations.delete_risk_type')}</h3>
                        <p className="text-slate-400 text-sm mb-4">
                            {t('admin:risk_types_panel.delete_confirm', { name: panel.deleteConfirm.display_name })}
                            {panel.deleteConfirm.risk_count > 0 && (
                                <span className="block mt-2 text-amber-400">
                                    {t('admin:risk_types_panel.delete_warning', { count: panel.deleteConfirm.risk_count })}
                                </span>
                            )}
                        </p>
                        <RiskHubFieldError errorKey={panel.actionErrorKey} />
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={panel.closeDelete}
                                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                            >
                                {t('common:actions.cancel')}
                            </button>
                            <button
                                onClick={() => void panel.handleDelete()}
                                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                            >
                                {t('common:actions.delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
