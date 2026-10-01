import { Archive, Edit, RotateCcw, Users } from 'lucide-react';

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
                    <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                            {t('admin:roles_panel.columns.role_name')}
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                            {t('admin:roles_panel.columns.permissions')}
                        </th>
                        <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">
                            {t('admin:roles_panel.columns.users')}
                        </th>
                        <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">
                            {t('common:labels.status')}
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
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
                                    'border-b border-border hover:bg-tint/5 transition-colors',
                                    !role.is_active && 'opacity-50',
                                )}
                            >
                                <td className="py-3 px-4">
                                    <div className="font-medium text-foreground">{role.display_name}</div>
                                    <code className="text-xs text-muted-foreground font-mono">{role.name}</code>
                                    {role.description && (
                                        <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{role.description}</div>
                                    )}
                                </td>
                                <td className="py-3 px-4">
                                    <div className="flex flex-wrap gap-1 max-w-md">
                                        {renderPermissions(role, t)}
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-center">
                                    <div className="flex items-center justify-center gap-1.5 px-2 py-0.5 bg-tint/5 rounded-full inline-flex">
                                        <Users className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-xs text-foreground">{role.user_count}</span>
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
                                                    ? 'text-muted-foreground opacity-50 cursor-not-allowed'
                                                    : 'text-muted-foreground hover:text-foreground hover:bg-tint/10',
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
                                                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                                                title={t('common:actions.archive_named', { name: role.display_name })}
                                                aria-label={t('common:actions.archive_named', { name: role.display_name })}
                                            >
                                                <Archive className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        )}

                                        {actions.canRestore && (
                                            <button
                                                onClick={() => onRestore(role)}
                                                className="p-1.5 text-muted-foreground hover:text-success-text hover:bg-success/10 rounded transition-colors"
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
            <span className="px-1.5 py-0.5 bg-info/20 rounded text-xs text-accent-text border border-info/20 font-bold">
                {t('admin:roles_panel.badges.admin_permissions')}
            </span>
        );
    }

    if (role.permissions.includes('*:*')) {
        return (
            <span className="px-1.5 py-0.5 bg-accent/20 rounded text-xs text-accent-text border border-accent/20 font-bold">
                {t('admin:roles_panel.badges.full_access')}
            </span>
        );
    }

    if (role.permissions.length === 0) {
        return <span className="text-xs text-muted-foreground italic">{t('labels.no_permissions')}</span>;
    }

    return role.permissions.map((permission) => (
        <span key={permission} className="px-1.5 py-0.5 bg-tint/10 rounded text-xs text-foreground border border-border">
            {permission}
        </span>
    ));
}

function renderStatus(role: RoleHubRead, t: (key: string) => string) {
    if (role.is_system) {
        return (
            <span className="px-2 py-0.5 bg-info/10 text-accent-text rounded-full text-xs border border-info/20">
                {t('admin:roles_panel.badges.system')}
            </span>
        );
    }

    if (role.is_active) {
        return (
            <span className="px-2 py-0.5 bg-success/10 text-success-text rounded-full text-xs border border-success/20">
                {t('admin:roles_panel.badges.active')}
            </span>
        );
    }

    return (
        <span className="px-2 py-0.5 bg-destructive/10 text-destructive rounded-full text-xs border border-destructive/20">
            {t('admin:roles_panel.badges.deleted')}
        </span>
    );
}
