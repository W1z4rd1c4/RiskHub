import React from 'react';
import { useTranslation } from '@/i18n/hooks';
import { formatDateTimeValue } from '@/i18n/formatters';
import {
    Edit2,
    UserX,
    UserCheck,
    Mail,
    Shield,
    Building2,
    Crown,
    ChevronDown,
    ChevronRight,
    Server
} from 'lucide-react';
import type { AccessUserRead } from '@/types/access';
import type { UserDirectoryEntry } from '@/types/user';
import { cn } from '@/lib/utils';
import { PermissionChips, PermissionMatrix } from '@/components/access/PermissionMatrix';

// Scope badge colors
const scopeColors: Record<string, string> = {
    global: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    platform: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    department: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    manager: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

interface UsersTableProps {
    isAccessMode: boolean;
    isLoading: boolean;
    accessUsers: AccessUserRead[];
    directoryUsers: UserDirectoryEntry[];
    expandedUserId: number | null;
    onToggleExpand: (userId: number) => void;
    canEditAccess: boolean;
    canManageUsers: boolean;
    onEditAccess: (user: AccessUserRead) => void;
    onToggleStatus: (user: AccessUserRead) => void;
    canRunDirectoryChecks?: boolean;
    checkingDirectoryUserId?: number | null;
    onCheckDirectory?: (user: AccessUserRead) => void;
}

export function UsersTable({
    isAccessMode,
    isLoading,
    accessUsers,
    directoryUsers,
    expandedUserId,
    onToggleExpand,
    canEditAccess,
    canManageUsers,
    onEditAccess,
    onToggleStatus,
    canRunDirectoryChecks = false,
    checkingDirectoryUserId = null,
    onCheckDirectory,
}: UsersTableProps) {
    const { t, i18n } = useTranslation('admin');
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="border-b border-white/10">
                        <th className="py-4 px-4 text-sm font-semibold text-slate-300">{t('access.table.user')}</th>
                        <th className="py-4 px-4 text-sm font-semibold text-slate-300">{t('access.table.role_department')}</th>
                        {isAccessMode && (
                            <th className="py-4 px-4 text-sm font-semibold text-slate-300">{t('access.table.scope')}</th>
                        )}
                        {isAccessMode && (
                            <th className="py-4 px-4 text-sm font-semibold text-slate-300">{t('access.table.permissions')}</th>
                        )}
                        <th className="py-4 px-4 text-sm font-semibold text-slate-300">{t('access.table.status')}</th>
                        <th className="py-4 px-4 text-sm font-semibold text-slate-300 text-right">{t('access.table.actions')}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {isLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <tr key={i} className="animate-pulse">
                                <td colSpan={isAccessMode ? 6 : 4} className="py-8 px-4 h-16 bg-white/5 rounded-lg mb-2" />
                            </tr>
                        ))
                    ) : isAccessMode && accessUsers.length > 0 ? (
                        accessUsers.map((user) => (
                            <React.Fragment key={user.id}>
                                <tr className="group hover:bg-white/5 transition-colors">
                                    <td className="py-4 px-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold">
                                                {user.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-medium text-white group-hover:text-accent transition-colors">{user.name}</p>
                                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                                    <Mail className="h-3 w-3" />
                                                    {user.email}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4">
                                        <div className="space-y-1">
                                            <p className="text-sm text-white flex items-center gap-1.5">
                                                <Shield className="h-3.5 w-3.5 text-purple-400" />
                                                {user.role.display_name}
                                            </p>
                                            <p className="text-xs text-slate-500 flex items-center gap-1.5">
                                                <Building2 className="h-3.5 w-3.5 text-slate-500" />
                                                {user.department_name || t('access.table.no_department')}
                                            </p>
                                            {user.external_id && (
                                                <p className="text-xs text-slate-500">
                                                    {t('users.directory_status_label', { defaultValue: 'Directory status:' })}{' '}
                                                    <span className="text-slate-300">
                                                        {user.directory_sync_status || t('common:fallbacks.not_available')}
                                                    </span>
                                                    {user.directory_last_checked_at && (
                                                        <>
                                                            {' • '}
                                                            {formatDateTimeValue(user.directory_last_checked_at, i18n.language)}
                                                        </>
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-4 px-4">
                                        <span className={cn(
                                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                                            user.role.name === 'admin'
                                                ? scopeColors.platform
                                                : (scopeColors[user.access_scope] || scopeColors.manager)
                                        )}
                                        >
                                            {user.role.name === 'admin' ? (
                                                <Server className="h-3 w-3 mr-1" />
                                            ) : user.access_scope === 'global' ? (
                                                <Crown className="h-3 w-3 mr-1" />
                                            ) : null}
                                            {user.role.name === 'admin'
                                                ? t('access.scopes.platform')
                                                : t(`access.scopes.${user.access_scope}`, user.scope_label)
                                            }
                                        </span>
                                    </td>
                                    <td className="py-4 px-4">
                                        {user.role.name === 'admin' ? (
                                            /* Admin: Show platform capabilities */
                                            <div className="flex items-center gap-2">
                                                <span className="px-2 py-0.5 bg-slate-500/20 text-slate-400 rounded text-xs border border-slate-500/30">{t('access.capabilities.user_management')}</span>
                                                <span className="px-2 py-0.5 bg-slate-500/20 text-slate-400 rounded text-xs border border-slate-500/30">{t('access.capabilities.system_health')}</span>
                                                <span className="px-2 py-0.5 bg-slate-500/20 text-slate-400 rounded text-xs border border-slate-500/30">{t('access.capabilities.technical_logs')}</span>
                                                <span className="px-2 py-0.5 bg-slate-500/20 text-slate-400 rounded text-xs border border-slate-500/30">{t('access.capabilities.session_management')}</span>
                                                <button
                                                    onClick={() => onToggleExpand(user.id)}
                                                    className="p-1 text-slate-500 hover:text-white rounded transition-colors"
                                                    title={t('access.matrix.show_all_capabilities')}
                                                    aria-label={t('access.matrix.show_all_capabilities')}
                                                >
                                                    {expandedUserId === user.id
                                                        ? <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                                        : <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                                    }
                                                </button>
                                            </div>
                                        ) : user.role.name === 'cro' ? (
                                            /* CRO: Show Risk Hub capabilities */
                                            <div className="flex items-center gap-2">
                                                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs border border-amber-500/30">{t('access.capabilities.risk_types')}</span>
                                                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs border border-amber-500/30">{t('access.capabilities.global_config')}</span>
                                                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs border border-amber-500/30">{t('access.capabilities.approval_rules')}</span>
                                                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs border border-purple-500/30">{t('access.capabilities.all_business_data')}</span>
                                                <button
                                                    onClick={() => onToggleExpand(user.id)}
                                                    className="p-1 text-slate-500 hover:text-white rounded transition-colors"
                                                    title={t('access.matrix.show_all_capabilities')}
                                                    aria-label={t('access.matrix.show_all_capabilities')}
                                                >
                                                    {expandedUserId === user.id
                                                        ? <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                                        : <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                                    }
                                                </button>
                                            </div>
                                        ) : (
                                            /* Regular users: Show business permissions */
                                            <div className="flex items-center gap-2">
                                                <PermissionChips permissions={user.effective_permissions} maxVisible={4} />
                                                <button
                                                    onClick={() => onToggleExpand(user.id)}
                                                    className="p-1 text-slate-500 hover:text-white rounded transition-colors"
                                                    title={t('access.matrix.show_all_permissions')}
                                                    aria-label={t('access.matrix.show_all_permissions')}
                                                >
                                                    {expandedUserId === user.id
                                                        ? <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                                        : <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                                    }
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-4 px-4">
                                        <span className={cn(
                                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                                            user.is_active
                                                ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                                : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                                        )}>
                                            {user.is_active ? t('access.status.active') : t('access.status.inactive')}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            {canEditAccess && (
                                                <button
                                                    onClick={() => onEditAccess(user)}
                                                    className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                                                    title={t('access.actions.edit_access')}
                                                    aria-label={t('access.actions.edit_access')}
                                                >
                                                    <Edit2 className="h-4 w-4" aria-hidden="true" />
                                                </button>
                                            )}
                                            {canManageUsers && (
                                                <button
                                                    onClick={() => onToggleStatus(user)}
                                                    className={cn(
                                                        "p-2 rounded-lg transition-all",
                                                        user.is_active
                                                            ? "text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                                                            : "text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                                                    )}
                                                    title={user.is_active ? t('access.actions.deactivate') : t('access.actions.activate')}
                                                    aria-label={user.is_active ? t('access.actions.deactivate') : t('access.actions.activate')}
                                                >
                                                    {user.is_active ? <UserX className="h-4 w-4" aria-hidden="true" /> : <UserCheck className="h-4 w-4" aria-hidden="true" />}
                                                </button>
                                            )}
                                            {canRunDirectoryChecks && user.external_id && onCheckDirectory && (
                                                <button
                                                    onClick={() => onCheckDirectory(user)}
                                                    disabled={checkingDirectoryUserId === user.id}
                                                    className="rounded-lg border border-sky-500/30 px-2.5 py-1.5 text-xs text-sky-300 transition hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                                                    title={t('users.check_directory_status', { defaultValue: 'Check directory status' })}
                                                >
                                                    {checkingDirectoryUserId === user.id
                                                        ? t('users.checking_directory', { defaultValue: 'Checking...' })
                                                        : t('users.check_directory', { defaultValue: 'Check AD' })}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                                {/* Expanded permissions/capabilities row */}
                                {expandedUserId === user.id && (
                                    <tr>
                                        <td colSpan={6} className="bg-white/5 px-8 py-4">
                                            {user.role.name === 'admin' ? (
                                                /* Admin: Show platform capabilities */
                                                <>
                                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                                                        {t('access.capabilities.platform_admin')}
                                                    </div>
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                        <div className="bg-white/5 p-3 rounded-lg">
                                                            <div className="text-slate-400 text-xs mb-1">{t('access.capabilities.user_management')}</div>
                                                            <div className="text-white text-sm">{t('access.capabilities.user_management_desc')}</div>
                                                        </div>
                                                        <div className="bg-white/5 p-3 rounded-lg">
                                                            <div className="text-slate-400 text-xs mb-1">{t('access.capabilities.system_health')}</div>
                                                            <div className="text-white text-sm">{t('access.capabilities.system_health_desc')}</div>
                                                        </div>
                                                        <div className="bg-white/5 p-3 rounded-lg">
                                                            <div className="text-slate-400 text-xs mb-1">{t('access.capabilities.technical_logs')}</div>
                                                            <div className="text-white text-sm">{t('access.capabilities.technical_logs_desc')}</div>
                                                        </div>
                                                        <div className="bg-white/5 p-3 rounded-lg">
                                                            <div className="text-slate-400 text-xs mb-1">{t('access.capabilities.session_management')}</div>
                                                            <div className="text-white text-sm">{t('access.capabilities.session_management_desc')}</div>
                                                        </div>
                                                    </div>
                                                    <div className="mt-3 text-xs text-amber-400/70">
                                                        <Server className="h-3 w-3 inline mr-1" />
                                                        {t('access.capabilities.platform_admin_note')}
                                                    </div>
                                                </>
                                            ) : user.role.name === 'cro' ? (
                                                /* CRO: Show Risk Hub capabilities */
                                                <>
                                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                                                        {t('access.capabilities.riskhub')}
                                                    </div>
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                        <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                                                            <div className="text-amber-400 text-xs mb-1">{t('access.capabilities.risk_types')}</div>
                                                            <div className="text-white text-sm">{t('access.capabilities.risk_types_desc')}</div>
                                                        </div>
                                                        <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                                                            <div className="text-amber-400 text-xs mb-1">{t('access.capabilities.global_config')}</div>
                                                            <div className="text-white text-sm">{t('access.capabilities.global_config_desc')}</div>
                                                        </div>
                                                        <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                                                            <div className="text-amber-400 text-xs mb-1">{t('access.capabilities.approval_rules')}</div>
                                                            <div className="text-white text-sm">{t('access.capabilities.approval_rules_desc')}</div>
                                                        </div>
                                                        <div className="bg-purple-500/10 p-3 rounded-lg border border-purple-500/20">
                                                            <div className="text-purple-400 text-xs mb-1">{t('access.capabilities.all_business_data')}</div>
                                                            <div className="text-white text-sm">{t('access.capabilities.all_business_data_desc')}</div>
                                                        </div>
                                                    </div>
                                                    <div className="mt-3 text-xs text-amber-400/70">
                                                        <Crown className="h-3 w-3 inline mr-1" />
                                                        {t('access.capabilities.cro_note')}
                                                    </div>
                                                </>
                                            ) : (
                                                /* Regular users: Show business permissions matrix */
                                                <>
                                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                                                        {t('access.capabilities.effective_permissions')}
                                                    </div>
                                                    <PermissionMatrix permissions={user.effective_permissions} />
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))
                    ) : !isAccessMode && directoryUsers.length > 0 ? (
                        directoryUsers.map((user) => (
                            <tr key={user.id} className="group hover:bg-white/5 transition-colors">
                                <td className="py-4 px-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold">
                                            {user.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-medium text-white group-hover:text-accent transition-colors">{user.name}</p>
                                            <p className="text-xs text-slate-500 flex items-center gap-1">
                                                <Mail className="h-3 w-3" />
                                                {user.email}
                                            </p>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-4 px-4">
                                    <div className="space-y-1">
                                        <p className="text-sm text-white flex items-center gap-1.5">
                                            <Shield className="h-3.5 w-3.5 text-purple-400" />
                                            {user.role_display_name || user.role_name || t('common:fallbacks.unknown')}
                                        </p>
                                        <p className="text-xs text-slate-500 flex items-center gap-1.5">
                                            <Building2 className="h-3.5 w-3.5 text-slate-500" />
                                            {user.department_name || t('access.table.no_department')}
                                        </p>
                                    </div>
                                </td>
                                <td className="py-4 px-4">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                        {t('access.status.active')}
                                    </span>
                                </td>
                                <td className="py-4 px-4 text-right">
                                    <span className="text-xs text-slate-500 italic">{t('access.table.view_only')}</span>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={isAccessMode ? 6 : 4} className="py-12 text-center text-slate-500">
                                {t('access.table.no_users_found')}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
