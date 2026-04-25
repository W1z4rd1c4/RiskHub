import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/hooks';
import { apiClient } from '@/services/apiClient';
import type { PermissionRead, RoleHubCreate, RoleHubRead, RoleHubUpdate } from '@/services/riskHubApi';

import {
    groupPermissionsByResource,
    normalizeRoleIdentifier,
    selectedPermissionIdsForRole,
} from './rolePermissions';

interface RoleModalProps {
    allPermissions: PermissionRead[];
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: RoleHubCreate | RoleHubUpdate) => Promise<void>;
    permissionsLoading: boolean;
    role?: RoleHubRead | null;
}

export function RoleModal({
    allPermissions,
    isOpen,
    onClose,
    onSave,
    permissionsLoading,
    role,
}: RoleModalProps) {
    const { t } = useTranslation(['admin', 'common']);
    const [description, setDescription] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [selectedPermissionIds, setSelectedPermissionIds] = useState<number[]>([]);
    const permissionsByResource = useMemo(
        () => groupPermissionsByResource(allPermissions),
        [allPermissions],
    );

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setName(role?.name ?? '');
        setDisplayName(role?.display_name ?? '');
        setDescription(role?.description ?? '');
        setErrorKey(null);
        setSelectedPermissionIds(selectedPermissionIdsForRole(role, allPermissions));
    }, [allPermissions, isOpen, role]);

    function togglePermission(id: number) {
        setSelectedPermissionIds((current) => (
            current.includes(id)
                ? current.filter((permissionId) => permissionId !== id)
                : [...current, id]
        ));
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setErrorKey(null);
        setSaving(true);
        try {
            if (role) {
                await onSave({
                    display_name: displayName,
                    description,
                    permission_ids: selectedPermissionIds,
                });
            } else {
                await onSave({
                    name,
                    display_name: displayName,
                    description,
                    permission_ids: selectedPermissionIds,
                });
            }
            onClose();
        } catch (error: unknown) {
            setErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setSaving(false);
        }
    }

    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-white/10 shadow-2xl rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
                <h2 className="text-xl font-bold text-white mb-4">
                    {role ? t('admin:roles_panel.modal.edit_title') : t('admin:roles_panel.modal.new_title')}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {!role && (
                            <div>
                                <label htmlFor="role-name" className="block text-sm font-medium text-slate-300 mb-1">
                                    {t('admin:roles_panel.modal.fields.role_identifier')}
                                </label>
                                <input
                                    id="role-name"
                                    type="text"
                                    value={name}
                                    onChange={(event) => setName(normalizeRoleIdentifier(event.target.value))}
                                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent font-mono"
                                    placeholder={t('admin:roles_panel.modal.placeholders.role_identifier')}
                                    required
                                />
                                <p className="text-xs text-slate-500 mt-1">
                                    {t('admin:roles_panel.modal.hints.role_identifier')}
                                </p>
                            </div>
                        )}

                        <div className={cn(!role ? '' : 'md:col-span-2')}>
                            <label htmlFor="role-display-name" className="block text-sm font-medium text-slate-300 mb-1">
                                {t('admin:roles_panel.modal.fields.display_name')}
                            </label>
                            <input
                                id="role-display-name"
                                type="text"
                                value={displayName}
                                onChange={(event) => setDisplayName(event.target.value)}
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent"
                                placeholder={t('admin:roles_panel.modal.placeholders.display_name')}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="role-description" className="block text-sm font-medium text-slate-300 mb-1">
                            {t('common:labels.description')}
                        </label>
                        <textarea
                            id="role-description"
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent"
                            placeholder={t('admin:roles_panel.modal.placeholders.description')}
                            rows={2}
                        />
                    </div>

                    <div>
                        <span className="block text-sm font-medium text-slate-300 mb-3">
                            {t('admin:roles_panel.modal.fields.permissions')}
                        </span>
                        {permissionsLoading ? (
                            <div className="text-slate-400 text-sm py-4 text-center">
                                {t('admin:roles_panel.modal.loading_permissions')}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto p-1 custom-scrollbar">
                                {Object.entries(permissionsByResource).map(([resource, permissions]) => (
                                    <div key={resource} className="bg-white/5 rounded-lg p-3 border border-white/10">
                                        <h4 className="text-xs font-bold text-accent uppercase mb-2 tracking-wider">{resource}</h4>
                                        <div className="space-y-2">
                                            {permissions.map((permission) => (
                                                <label key={permission.id} className="flex items-start gap-2 cursor-pointer group">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedPermissionIds.includes(permission.id)}
                                                        onChange={() => togglePermission(permission.id)}
                                                        className="mt-0.5 rounded border-white/20 bg-white/5 text-accent focus:ring-accent"
                                                    />
                                                    <div>
                                                        <span className="block text-sm text-slate-200 group-hover:text-white transition-colors">
                                                            {permission.action}
                                                        </span>
                                                        {permission.description && (
                                                            <span className="block text-xs text-slate-500">
                                                                {permission.description}
                                                            </span>
                                                        )}
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {errorKey && (
                        <div className="flex items-center gap-2 text-red-400 text-sm">
                            <AlertCircle className="h-4 w-4" />
                            {t(errorKey, { ns: 'errorKeys' })}
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                        >
                            {t('common:actions.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={saving || permissionsLoading}
                            className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
                        >
                            {saving ? t('admin:roles_panel.modal.saving') : t('admin:roles_panel.modal.save_role')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
