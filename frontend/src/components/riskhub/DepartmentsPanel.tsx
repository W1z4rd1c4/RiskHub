import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building, Plus, Edit, Trash2, RotateCcw, AlertCircle, Users, Activity, Shield } from 'lucide-react';
import { riskHubApi } from '@/services/riskHubApi';
import { accessApi } from '@/services/accessApi';
import { apiClient } from '@/services/apiClient';
import type { DepartmentHubCreate, DepartmentHubUpdate, DepartmentHubRead } from '@/services/riskHubApi';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { cn } from '@/lib/utils';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
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
        queryKey: ['users', 'access'],
        queryFn: () => accessApi.listAccessUsers(),
        enabled: isOpen,
    });

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
                    manager_id: managerId
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
        <RiskHubModalFrame title={department ? t('admin:departments_panel.modal.edit_title') : t('admin:departments_panel.modal.new_title')}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin:departments_panel.modal.fields.department_name')}</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent"
                            placeholder={t('admin:departments_panel.modal.placeholders.department_name')}
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin:departments_panel.modal.fields.code_optional')}</label>
                        <input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent font-mono"
                            placeholder={t('admin:departments_panel.modal.placeholders.code')}
                        />
                        <p className="text-xs text-slate-500 mt-1">{t('admin:departments_panel.modal.hints.code')}</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">{t('common:labels.owner')}</label>
                        <ThemedSelect
                            value={managerId?.toString() ?? ''}
                            onValueChange={(v) => setManagerId(v ? Number(v) : undefined)}
                            placeholder={t('admin:departments_panel.modal.placeholders.no_manager')}
                            allowEmpty
                            emptyLabel={t('admin:departments_panel.modal.placeholders.no_manager')}
                            className="w-full"
                            options={users?.map(user => ({ value: user.id.toString(), label: `${user.name} (${user.email})` })) ?? []}
                        />
                    </div>

                    <RiskHubFieldError errorKey={errorKey} />
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
    const panel = useRiskHubConfigResource<DepartmentHubRead, DepartmentHubCreate, DepartmentHubUpdate>({
        queryKey: ['departments'],
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
        return <div className="text-slate-400 text-center py-8">{t('common:loading.departments')}</div>;
    }

    return (
        <div className="space-y-4">
            {panel.actionErrorKey && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <AlertCircle className="h-4 w-4" />
                    {t(panel.actionErrorKey, { ns: 'errorKeys' })}
                </div>
            )}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Building className="h-5 w-5 text-accent" />
                    <h3 className="text-lg font-semibold text-white">{t('admin:departments_panel.title')}</h3>
                </div>

                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-400">
                        <input
                            type="checkbox"
                            checked={panel.showInactive}
                            onChange={(e) => panel.setShowInactive(e.target.checked)}
                            className="rounded border-white/20 bg-white/5 text-accent focus:ring-accent"
                        />
                        {t('admin:departments_panel.show_deleted')}
                    </label>

                    {canCreate ? (
                        <button
                            onClick={panel.openCreate}
                            className="flex items-center gap-2 px-3 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
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
                        <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('admin:departments_panel.columns.name_code')}</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('admin:departments_panel.columns.manager')}</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">{t('admin:departments_panel.columns.users')}</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">{t('admin:departments_panel.columns.risks')}</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">{t('admin:departments_panel.columns.controls')}</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">{t('common:labels.status')}</th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">{t('common:labels.actions')}</th>
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
                                    "border-b border-white/5 hover:bg-white/5 transition-colors",
                                    !dept.is_active && "opacity-50"
                                )}
                            >
                                <td className="py-3 px-4">
                                    <div className="font-medium text-white">{dept.name}</div>
                                    {dept.code && (
                                        <code className="text-xs text-slate-500 font-mono">{dept.code}</code>
                                    )}
                                </td>
                                <td className="py-3 px-4">
                                    {dept.manager_name ? (
                                        <div className="text-sm text-slate-300">{dept.manager_name}</div>
                                    ) : (
                                        <span className="text-xs text-slate-500 italic">{t('labels.no_manager')}</span>
                                    )}
                                </td>
                                <td className="py-3 px-4 text-center">
                                    <div className="flex items-center justify-center gap-1.5 px-2 py-0.5 bg-white/5 rounded-full inline-flex">
                                        <Users className="h-3 w-3 text-slate-400" />
                                        <span className="text-xs text-slate-300">{dept.user_count}</span>
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-center">
                                    <div className="flex items-center justify-center gap-1.5 px-2 py-0.5 bg-amber-500/10 rounded-full inline-flex">
                                        <Activity className="h-3 w-3 text-amber-500/50" />
                                        <span className="text-xs text-amber-500/80">{dept.risk_count}</span>
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-center">
                                    <div className="flex items-center justify-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 rounded-full inline-flex">
                                        <Shield className="h-3 w-3 text-emerald-500/50" />
                                        <span className="text-xs text-emerald-500/80">{dept.control_count}</span>
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-center">
                                    {dept.is_active ? (
                                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full text-xs border border-emerald-500/20">
                                            {t('admin:departments_panel.badges.active')}
                                        </span>
                                    ) : (
                                        <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-xs border border-red-500/20">
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
                                                    ? "text-slate-400 hover:text-white hover:bg-white/10"
                                                    : "text-slate-600 cursor-not-allowed"
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
                                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                title={t('common:actions.delete')}
                                                aria-label={t('common:actions.delete')}
                                            >
                                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        )}

                                        {canRestore && (
                                            <button
                                                onClick={() => panel.handleRestore(dept)}
                                                className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-white/10 shadow-2xl rounded-2xl w-full max-w-sm p-6">
                        <h3 className="text-lg font-bold text-white mb-2">{t('confirmations.delete_department')}</h3>
                        <div className="text-slate-400 text-sm mb-4">
                            {t('admin:departments_panel.delete_confirm', { name: panel.deleteConfirm.name })}
                            {(panel.deleteConfirm.user_count > 0
                                || panel.deleteConfirm.risk_count > 0
                                || panel.deleteConfirm.control_count > 0
                                || panel.deleteConfirm.kri_count > 0
                                || panel.deleteConfirm.vendor_count > 0
                                || panel.deleteConfirm.pending_orphan_count > 0) && (
                                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg space-y-1 text-red-400 text-xs">
                                    <div className="flex items-center gap-2 font-bold">
                                        <AlertCircle className="h-4 w-4" />
                                        {t('admin:departments_panel.delete_blocked_title')}
                                    </div>
                                    <ul className="list-disc list-inside ml-1">
                                        {panel.deleteConfirm.user_count > 0 && <li>{t('admin:departments_panel.linked_counts.users', { count: panel.deleteConfirm.user_count })}</li>}
                                        {panel.deleteConfirm.risk_count > 0 && <li>{t('admin:departments_panel.linked_counts.risks', { count: panel.deleteConfirm.risk_count })}</li>}
                                        {panel.deleteConfirm.control_count > 0 && <li>{t('admin:departments_panel.linked_counts.controls', { count: panel.deleteConfirm.control_count })}</li>}
                                        {panel.deleteConfirm.kri_count > 0 && <li>{t('admin:departments_panel.linked_counts.kris', { count: panel.deleteConfirm.kri_count })}</li>}
                                        {panel.deleteConfirm.vendor_count > 0 && <li>{t('admin:departments_panel.linked_counts.vendors', { count: panel.deleteConfirm.vendor_count })}</li>}
                                        {panel.deleteConfirm.pending_orphan_count > 0 && <li>{t('admin:departments_panel.linked_counts.pending_orphans', { count: panel.deleteConfirm.pending_orphan_count })}</li>}
                                    </ul>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={panel.closeDelete}
                                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                            >
                                {t('common:actions.cancel')}
                            </button>
                            {panel.deleteConfirm.user_count === 0
                                && panel.deleteConfirm.risk_count === 0
                                && panel.deleteConfirm.control_count === 0
                                && panel.deleteConfirm.kri_count === 0
                                && panel.deleteConfirm.vendor_count === 0
                                && panel.deleteConfirm.pending_orphan_count === 0 && (
                                <button
                                    onClick={() => void panel.handleDelete()}
                                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                                >
                                    {t('common:actions.delete')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
