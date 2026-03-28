import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Palette, Plus, Edit, Trash2, RotateCcw, AlertCircle } from 'lucide-react';
import { riskHubApi } from '@/services/riskHubApi';
import { apiClient } from '@/services/apiClient';
import type { RiskType, RiskTypeCreate, RiskTypeUpdate } from '@/services/riskHubApi';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/hooks';

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-white/10 shadow-2xl rounded-2xl w-full max-w-md p-6">
                <h2 className="text-xl font-bold text-white mb-4">
                    {riskType ? t('admin:risk_types_panel.modal.edit_title') : t('admin:risk_types_panel.modal.new_title')}
                </h2>

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

                    {errorKey && (
                        <div className="flex items-center gap-2 text-red-400 text-sm">
                            <AlertCircle className="h-4 w-4" />
                            {t(errorKey, { ns: 'errorKeys' })}
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/10 mt-6">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                        >
                            {t('common:actions.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
                        >
                            {saving ? t('admin:risk_types_panel.modal.saving') : t('common:actions.save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export function RiskTypesPanel() {
    const queryClient = useQueryClient();
    const { t } = useTranslation(['admin', 'common']);
    const [showInactive, setShowInactive] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingType, setEditingType] = useState<RiskType | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<RiskType | null>(null);

    const { data: riskTypes, isLoading, error } = useQuery({
        queryKey: ['riskTypes', showInactive],
        queryFn: () => riskHubApi.getRiskTypes(showInactive),
    });

    const createMutation = useMutation({
        mutationFn: (data: RiskTypeCreate) => riskHubApi.createRiskType(data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['riskTypes'] }),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: RiskTypeUpdate }) => riskHubApi.updateRiskType(id, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['riskTypes'] }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => riskHubApi.deleteRiskType(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['riskTypes'] }),
    });

    const restoreMutation = useMutation({
        mutationFn: (id: number) => riskHubApi.restoreRiskType(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['riskTypes'] }),
    });

    const handleSave = async (data: RiskTypeCreate | RiskTypeUpdate) => {
        if (editingType) {
            await updateMutation.mutateAsync({ id: editingType.id, data: data as RiskTypeUpdate });
        } else {
            await createMutation.mutateAsync(data as RiskTypeCreate);
        }
    };

    const handleDelete = async () => {
        if (deleteConfirm) {
            await deleteMutation.mutateAsync(deleteConfirm.id);
            setDeleteConfirm(null);
        }
    };

    if (isLoading) {
        return <div className="text-slate-400 text-center py-8">{t('common:loading.risk_types')}</div>;
    }

    if (error) {
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
                            checked={showInactive}
                            onChange={(e) => setShowInactive(e.target.checked)}
                            className="rounded border-white/20 bg-white/5 text-accent focus:ring-accent"
                        />
                        {t('admin:risk_types_panel.show_deleted')}
                    </label>

                    <button
                        onClick={() => { setEditingType(null); setModalOpen(true); }}
                        className="flex items-center gap-2 px-3 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
                    >
                        <Plus className="h-4 w-4" />
                        {t('admin:risk_types_panel.add_type')}
                    </button>
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
                        {riskTypes?.map((type) => (
                            <tr
                                key={type.id}
                                className={cn(
                                    "border-b border-white/5 hover:bg-white/5 transition-colors",
                                    !type.is_active && "opacity-50"
                                )}
                            >
                                <td className="py-3 px-4">
                                    <div
                                        className="w-6 h-6 rounded-full border-2 border-white/20"
                                        style={{ backgroundColor: type.color }}
                                    />
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
                                        <button
                                            onClick={() => { setEditingType(type); setModalOpen(true); }}
                                            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                                            title={t('common:actions.edit')}
                                            aria-label={t('common:actions.edit')}
                                        >
                                            <Edit className="h-4 w-4" aria-hidden="true" />
                                        </button>

                                        {!type.is_system && type.is_active && (
                                            <button
                                                onClick={() => setDeleteConfirm(type)}
                                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                title={t('common:actions.delete')}
                                                aria-label={t('common:actions.delete')}
                                            >
                                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        )}

                                        {!type.is_active && (
                                            <button
                                                onClick={() => restoreMutation.mutate(type.id)}
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
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Create/Edit Modal */}
            <RiskTypeModal
                isOpen={modalOpen}
                onClose={() => { setModalOpen(false); setEditingType(null); }}
                riskType={editingType}
                onSave={handleSave}
            />

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-white/10 shadow-2xl rounded-2xl w-full max-w-sm p-6">
                        <h3 className="text-lg font-bold text-white mb-2">{t('confirmations.delete_risk_type')}</h3>
                        <p className="text-slate-400 text-sm mb-4">
                            {t('admin:risk_types_panel.delete_confirm', { name: deleteConfirm.display_name })}
                            {deleteConfirm.risk_count > 0 && (
                                <span className="block mt-2 text-amber-400">
                                    {t('admin:risk_types_panel.delete_warning', { count: deleteConfirm.risk_count })}
                                </span>
                            )}
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                            >
                                {t('common:actions.cancel')}
                            </button>
                            <button
                                onClick={handleDelete}
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
