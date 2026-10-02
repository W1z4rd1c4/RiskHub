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

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TD, TR } from '@/components/ui/table';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { toneClass } from '@/lib/tones';
import type { AccessUserRead } from '@/types/access';

import { PermissionChips } from './PermissionMatrix';
import { ExpandedAccessDetailsRow } from './ExpandedAccessDetailsRow';
import { UserAvatar } from './UserAvatar';
import type { AccessUserActionModel, AccessUserPresentationModel } from './useAccessUsersWorkflow';
import { accessDetailsRowId, userScopeTone } from './usersTablePresentation';

interface AccessUserRowProps {
    actionModel: AccessUserActionModel;
    canRunDirectoryChecks: boolean;
    checkingDirectoryUserId: number | null;
    expandedUserId: number | null;
    onBreakGlassEnable?: (user: AccessUserRead) => void;
    onCheckDirectory?: (user: AccessUserRead) => void;
    onManageIdentity?: (user: AccessUserRead) => void;
    onEditAccess: (user: AccessUserRead) => void;
    onToggleExpand: (userId: number) => void;
    onToggleStatus: (user: AccessUserRead) => void;
    presentationModel: AccessUserPresentationModel;
    user: AccessUserRead;
}

function ExpandToggle({ expandedUserId, onToggleExpand, user, label }: Pick<AccessUserRowProps, 'expandedUserId' | 'onToggleExpand' | 'user'> & { label: string }) {
    const isExpanded = expandedUserId === user.id;
    // AX-10: the disclosure state is exposed (`aria-expanded`) and the controlled
    // details row is named (`aria-controls`) while it is on screen.
    return (
        <Button
            type="button"
            variant="ghost"
            size="iconCompact"
            onClick={() => onToggleExpand(user.id)}
            title={label}
            aria-label={label}
            aria-expanded={isExpanded}
            aria-controls={isExpanded ? accessDetailsRowId(user.id) : undefined}
        >
            {isExpanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
        </Button>
    );
}

function UserCapabilitySummary({ expandedUserId, onToggleExpand, user }: Pick<AccessUserRowProps, 'expandedUserId' | 'onToggleExpand' | 'user'>) {
    const { t } = useTranslation('admin');

    if (user.role.name === 'admin') {
        return (
            <div className="flex flex-wrap items-center gap-2">
                <Badge shape="rounded" tone="neutral">{t('access.capabilities.user_management')}</Badge>
                <Badge shape="rounded" tone="neutral">{t('access.capabilities.system_health')}</Badge>
                <Badge shape="rounded" tone="neutral">{t('access.capabilities.technical_logs')}</Badge>
                <Badge shape="rounded" tone="neutral">{t('access.capabilities.session_management')}</Badge>
                <ExpandToggle expandedUserId={expandedUserId} onToggleExpand={onToggleExpand} user={user} label={t('access.matrix.show_all_capabilities')} />
            </div>
        );
    }

    if (user.role.name === 'cro') {
        return (
            <div className="flex flex-wrap items-center gap-2">
                <Badge shape="rounded" tone="warning">{t('access.capabilities.risk_types')}</Badge>
                <Badge shape="rounded" tone="warning">{t('access.capabilities.global_config')}</Badge>
                <Badge shape="rounded" tone="warning">{t('access.capabilities.approval_rules')}</Badge>
                <Badge shape="rounded" tone="accent">{t('access.capabilities.all_business_data')}</Badge>
                <ExpandToggle expandedUserId={expandedUserId} onToggleExpand={onToggleExpand} user={user} label={t('access.matrix.show_all_capabilities')} />
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <PermissionChips permissions={user.effective_permissions} maxVisible={4} />
            <ExpandToggle expandedUserId={expandedUserId} onToggleExpand={onToggleExpand} user={user} label={t('access.matrix.show_all_permissions')} />
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
    onManageIdentity,
    onToggleExpand,
    onToggleStatus,
    presentationModel,
    user,
}: AccessUserRowProps) {
    const { t } = useTranslation('admin');
    const format = useFormat();
    const canChangeActiveStatus = actionModel.canDeactivate || actionModel.canReactivate;

    return (
        <Fragment>
            <TR className="group">
                <TD>
                    <div className="flex items-center gap-3">
                        <UserAvatar name={presentationModel.safeName} />
                        <div>
                            <p className="font-medium text-foreground group-hover:text-accent-text transition-colors">{presentationModel.safeName}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Mail aria-hidden="true" className="h-3 w-3" />
                                {presentationModel.emailText}
                            </p>
                        </div>
                    </div>
                </TD>
                <TD>
                    <div className="space-y-1">
                        <p className="text-sm text-foreground flex items-center gap-1.5">
                            <Shield aria-hidden="true" className="h-3.5 w-3.5 text-chart-2" />
                            {presentationModel.roleText}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <Building2 aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                            {user.department_name || t('access.table.no_department')}
                        </p>
                        {user.external_id && (
                            <p className="text-xs text-muted-foreground">
                                {t('users.directory_status_label')}{' '}
                                <span className="text-foreground">
                                    {presentationModel.directoryStatus || t('common:fallbacks.not_available')}
                                </span>
                                {user.directory_last_checked_at && (
                                    <>
                                        {' • '}
                                        {format.dateTime(user.directory_last_checked_at)}
                                    </>
                                )}
                            </p>
                        )}
                    </div>
                </TD>
                <TD>
                    <Badge tone={userScopeTone(user)}>
                        {user.role.name === 'admin' ? (
                            <Server aria-hidden="true" className="h-3 w-3" />
                        ) : user.access_scope === 'global' ? (
                            <Crown aria-hidden="true" className="h-3 w-3" />
                        ) : null}
                        {user.role.name === 'admin'
                            ? t('access.scopes.platform')
                            : t(`access.scopes.${user.access_scope}`, user.scope_label)}
                    </Badge>
                </TD>
                <TD>
                    <UserCapabilitySummary
                        expandedUserId={expandedUserId}
                        onToggleExpand={onToggleExpand}
                        user={user}
                    />
                </TD>
                <TD>
                    <Badge tone={user.is_active ? 'success' : 'danger'}>
                        {user.is_active ? t('access.status.active') : t('access.status.inactive')}
                        {onManageIdentity && user.local_enrollment_state && <span className="ml-1">{t(`native_users.states.${user.local_enrollment_state}`)}</span>}
                    </Badge>
                </TD>
                <TD align="right">
                    <div className="flex items-center justify-end gap-2">
                        {actionModel.canEdit && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="iconCompact"
                                onClick={() => onEditAccess(user)}
                                title={t('access.actions.edit_access')}
                                aria-label={t('access.actions.edit_access')}
                            >
                                <Edit2 aria-hidden="true" />
                            </Button>
                        )}
                        {onManageIdentity && (
                            <Button type="button" variant="outline" size="compact" onClick={() => onManageIdentity(user)}>
                                {t('native_users.lifecycle')}
                            </Button>
                        )}
                        {canChangeActiveStatus && !onManageIdentity && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="iconCompact"
                                onClick={() => onToggleStatus(user)}
                                className={toneClass(user.is_active ? 'danger' : 'success', 'text')}
                                title={user.is_active ? t('access.actions.deactivate') : t('access.actions.activate')}
                                aria-label={user.is_active ? t('access.actions.deactivate') : t('access.actions.activate')}
                            >
                                {user.is_active ? <UserX aria-hidden="true" /> : <UserCheck aria-hidden="true" />}
                            </Button>
                        )}
                        {actionModel.canBreakGlassEnable && onBreakGlassEnable && (
                            <Button
                                type="button"
                                variant="outline"
                                size="compact"
                                onClick={() => onBreakGlassEnable(user)}
                                className="text-warning-text hover:text-warning-text"
                                title={t('users.break_glass_enable')}
                            >
                                <ShieldAlert aria-hidden="true" />
                                {t('users.break_glass')}
                            </Button>
                        )}
                        {canRunDirectoryChecks && actionModel.canRunDirectoryCheck && onCheckDirectory && (
                            <Button
                                type="button"
                                variant="outline"
                                size="compact"
                                onClick={() => onCheckDirectory(user)}
                                aria-busy={checkingDirectoryUserId === user.id}
                                aria-disabled={checkingDirectoryUserId !== null}
                                title={t('users.check_directory_status')}
                            >
                                {checkingDirectoryUserId === user.id
                                    ? t('users.checking_directory')
                                    : t('users.check_directory')}
                            </Button>
                        )}
                    </div>
                </TD>
            </TR>
            {expandedUserId === user.id && <ExpandedAccessDetailsRow user={user} />}
        </Fragment>
    );
}
