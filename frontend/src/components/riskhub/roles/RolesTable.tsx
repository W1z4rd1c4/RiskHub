import { Edit, RotateCcw, Trash2, Users } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/hooks';
import type { RoleHubRead } from '@/services/riskHubApi';

import { getRoleActionState } from './rolePermissions';

interface RolesTableProps {
    onDelete: (role: RoleHubRead) => void;
    onEdit: (role: RoleHubRead) => void;
    onRestore: (role: RoleHubRead) => void;
    roles: RoleHubRead[];
}

export function RolesTable({ onDelete, onEdit, onRestore, roles }: RolesTableProps) {
    const { t } = useTranslation(['admin', 'common']);

    return (
        <div className="overflow-x-auto">
            <table className="w-full">
                <thead>
                    <tr className="border-b border-white/10">
                        <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">
                            {t('admin:roles_panel.columns.role_name')}
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">
                            {t('admin:roles_panel.columns.permissions')}
                        </th>
                        <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">
                            {t('admin:roles_panel.columns.users')}
                        </th>
                        <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">
                            {t('common:labels.status')}
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">
                            {t('common:labels.actions')}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {roles.map((role) => {
                        const actions = getRoleActionState(role);
                        return (
                            <tr
                                key={role.id}
                                className={cn(
                                    'border-b border-white/5 hover:bg-white/5 transition-colors',
                                    !role.is_active && 'opacity-50',
                                )}
                            >
                                <td className="py-3 px-4">
                                    <div className="font-medium text-white">{role.display_name}</div>
                                    <code className="text-xs text-slate-500 font-mono">{role.name}</code>
                                    {role.description && (
                                        <div className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{role.description}</div>
                                    )}
                                </td>
                                <td className="py-3 px-4">
                                    <div className="flex flex-wrap gap-1 max-w-md">
                                        {renderPermissions(role, t)}
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-center">
                                    <div className="flex items-center justify-center gap-1.5 px-2 py-0.5 bg-white/5 rounded-full inline-flex">
                                        <Users className="h-3 w-3 text-slate-400" />
                                        <span className="text-xs text-slate-300">{role.user_count}</span>
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-center">
                                    {renderStatus(role, t)}
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => onEdit(role)}
                                            className={cn(
                                                'p-1.5 rounded transition-colors',
                                                !actions.canUpdate
                                                    ? 'text-slate-600 cursor-not-allowed'
                                                    : 'text-slate-400 hover:text-white hover:bg-white/10',
                                            )}
                                            disabled={!actions.canUpdate}
                                            title={!actions.canUpdate
                                                ? t('admin:roles_panel.actions.edit_disabled', { role: role.display_name })
                                                : t('common:actions.edit')}
                                            aria-label={!actions.canUpdate
                                                ? t('admin:roles_panel.actions.edit_disabled', { role: role.display_name })
                                                : t('common:actions.edit')}
                                        >
                                            <Edit className="h-4 w-4" aria-hidden="true" />
                                        </button>

                                        {actions.canDelete && (
                                            <button
                                                onClick={() => onDelete(role)}
                                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                title={t('common:actions.delete')}
                                                aria-label={t('common:actions.delete')}
                                            >
                                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        )}

                                        {actions.canRestore && (
                                            <button
                                                onClick={() => onRestore(role)}
                                                className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                                                title={t('admin:roles_panel.actions.restore')}
                                                aria-label={t('admin:roles_panel.actions.restore')}
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
    );
}

function renderPermissions(role: RoleHubRead, t: (key: string) => string) {
    if (role.name === 'admin') {
        return (
            <span className="px-1.5 py-0.5 bg-blue-500/20 rounded text-xs text-blue-400 border border-blue-500/20 font-bold">
                {t('admin:roles_panel.badges.admin_permissions')}
            </span>
        );
    }

    if (role.permissions.includes('*:*')) {
        return (
            <span className="px-1.5 py-0.5 bg-accent/20 rounded text-xs text-accent border border-accent/20 font-bold">
                {t('admin:roles_panel.badges.full_access')}
            </span>
        );
    }

    if (role.permissions.length === 0) {
        return <span className="text-xs text-slate-500 italic">{t('labels.no_permissions')}</span>;
    }

    return role.permissions.map((permission) => (
        <span key={permission} className="px-1.5 py-0.5 bg-white/10 rounded text-xs text-slate-300 border border-white/5">
            {permission}
        </span>
    ));
}

function renderStatus(role: RoleHubRead, t: (key: string) => string) {
    if (role.is_system) {
        return (
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full text-xs border border-blue-500/20">
                {t('admin:roles_panel.badges.system')}
            </span>
        );
    }

    if (role.is_active) {
        return (
            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full text-xs border border-emerald-500/20">
                {t('admin:roles_panel.badges.active')}
            </span>
        );
    }

    return (
        <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-xs border border-red-500/20">
            {t('admin:roles_panel.badges.deleted')}
        </span>
    );
}
