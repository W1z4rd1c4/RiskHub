import { Fragment } from 'react';
import {
    Building2,
    ChevronDown,
    ChevronRight,
    Crown,
    Edit2,
    Mail,
    Server,
    Shield,
    ShieldAlert,
    UserCheck,
    UserX,
} from 'lucide-react';

import { formatDateTimeValue } from '@/i18n/formatters';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import type { AccessUserRead } from '@/types/access';

import { PermissionChips } from './PermissionMatrix';
import { ExpandedAccessDetailsRow } from './ExpandedAccessDetailsRow';
import type { AccessUserActionModel, AccessUserPresentationModel } from './useAccessUsersWorkflow';
import { userScopeBadgeClassName } from './usersTablePresentation';

interface AccessUserRowProps {
    actionModel: AccessUserActionModel;
    canRunDirectoryChecks: boolean;
    checkingDirectoryUserId: number | null;
    expandedUserId: number | null;
    onBreakGlassEnable?: (user: AccessUserRead) => void;
    onCheckDirectory?: (user: AccessUserRead) => void;
    onEditAccess: (user: AccessUserRead) => void;
    onToggleExpand: (userId: number) => void;
    onToggleStatus: (user: AccessUserRead) => void;
    presentationModel: AccessUserPresentationModel;
    user: AccessUserRead;
}

function UserCapabilitySummary({ expandedUserId, onToggleExpand, user }: Pick<AccessUserRowProps, 'expandedUserId' | 'onToggleExpand' | 'user'>) {
    const { t } = useTranslation('admin');
    const isExpanded = expandedUserId === user.id;
    const expandIcon = isExpanded
        ? <ChevronDown className="h-4 w-4" aria-hidden="true" />
        : <ChevronRight className="h-4 w-4" aria-hidden="true" />;

    if (user.role.name === 'admin') {
        return (
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
                    {expandIcon}
                </button>
            </div>
        );
    }

    if (user.role.name === 'cro') {
        return (
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
                    {expandIcon}
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <PermissionChips permissions={user.effective_permissions} maxVisible={4} />
            <button
                onClick={() => onToggleExpand(user.id)}
                className="p-1 text-slate-500 hover:text-white rounded transition-colors"
                title={t('access.matrix.show_all_permissions')}
                aria-label={t('access.matrix.show_all_permissions')}
            >
                {expandIcon}
            </button>
        </div>
    );
}

export function AccessUserRow({
    actionModel,
    canRunDirectoryChecks,
    checkingDirectoryUserId,
    expandedUserId,
    onBreakGlassEnable,
    onCheckDirectory,
    onEditAccess,
    onToggleExpand,
    onToggleStatus,
    presentationModel,
    user,
}: AccessUserRowProps) {
    const { t, i18n } = useTranslation('admin');
    const canChangeActiveStatus = actionModel.canDeactivate || actionModel.canReactivate;

    return (
        <Fragment>
            <tr className="group hover:bg-white/5 transition-colors">
                <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold">
                            {presentationModel.safeName.charAt(0)}
                        </div>
                        <div>
                            <p className="font-medium text-white group-hover:text-accent transition-colors">{presentationModel.safeName}</p>
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {presentationModel.emailText}
                            </p>
                        </div>
                    </div>
                </td>
                <td className="py-4 px-4">
                    <div className="space-y-1">
                        <p className="text-sm text-white flex items-center gap-1.5">
                            <Shield className="h-3.5 w-3.5 text-purple-400" />
                            {presentationModel.roleText}
                        </p>
                        <p className="text-xs text-slate-500 flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-slate-500" />
                            {user.department_name || t('access.table.no_department')}
                        </p>
                        {user.external_id && (
                            <p className="text-xs text-slate-500">
                                {t('users.directory_status_label', { defaultValue: 'Directory status:' })}{' '}
                                <span className="text-slate-300">
                                    {presentationModel.directoryStatus || t('common:fallbacks.not_available')}
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
                    <span
                        className={cn(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
                            userScopeBadgeClassName(user),
                        )}
                    >
                        {user.role.name === 'admin' ? (
                            <Server className="h-3 w-3 mr-1" />
                        ) : user.access_scope === 'global' ? (
                            <Crown className="h-3 w-3 mr-1" />
                        ) : null}
                        {user.role.name === 'admin'
                            ? t('access.scopes.platform')
                            : t(`access.scopes.${user.access_scope}`, user.scope_label)}
                    </span>
                </td>
                <td className="py-4 px-4">
                    <UserCapabilitySummary
                        expandedUserId={expandedUserId}
                        onToggleExpand={onToggleExpand}
                        user={user}
                    />
                </td>
                <td className="py-4 px-4">
                    <span
                        className={cn(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                            user.is_active
                                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-500 border border-rose-500/20',
                        )}
                    >
                        {user.is_active ? t('access.status.active') : t('access.status.inactive')}
                    </span>
                </td>
                <td className="py-4 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                        {actionModel.canEdit && (
                            <button
                                onClick={() => onEditAccess(user)}
                                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                                title={t('access.actions.edit_access')}
                                aria-label={t('access.actions.edit_access')}
                            >
                                <Edit2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                        )}
                        {canChangeActiveStatus && (
                            <button
                                onClick={() => onToggleStatus(user)}
                                className={cn(
                                    'p-2 rounded-lg transition-all',
                                    user.is_active
                                        ? 'text-rose-400 hover:bg-rose-500/10 hover:text-rose-300'
                                        : 'text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300',
                                )}
                                title={user.is_active ? t('access.actions.deactivate') : t('access.actions.activate')}
                                aria-label={user.is_active ? t('access.actions.deactivate') : t('access.actions.activate')}
                            >
                                {user.is_active ? <UserX className="h-4 w-4" aria-hidden="true" /> : <UserCheck className="h-4 w-4" aria-hidden="true" />}
                            </button>
                        )}
                        {actionModel.canBreakGlassEnable && onBreakGlassEnable && (
                            <button
                                onClick={() => onBreakGlassEnable(user)}
                                className="rounded-lg border border-amber-500/30 px-2.5 py-1.5 text-xs text-amber-300 transition hover:bg-amber-500/10"
                                title={t('users.break_glass_enable', { defaultValue: 'Break-glass enable' })}
                            >
                                <span className="inline-flex items-center gap-1.5">
                                    <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                                    {t('users.break_glass', { defaultValue: 'Break-glass' })}
                                </span>
                            </button>
                        )}
                        {canRunDirectoryChecks && actionModel.canRunDirectoryCheck && onCheckDirectory && (
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
            {expandedUserId === user.id && <ExpandedAccessDetailsRow user={user} />}
        </Fragment>
    );
}
