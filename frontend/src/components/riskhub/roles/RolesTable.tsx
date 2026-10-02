import { Archive, Edit, Users } from 'lucide-react';

import { getPermissionLabel } from '@/components/access/permissionPresentation';
import { RowActionButton } from '@/components/tables/RowActionButton';
import { RowRestoreButton } from '@/components/tables/RowRestoreButton';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/state';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useFormat, useTranslation, type SafeTFunction } from '@/i18n/hooks';
import type { RoleHubRead } from '@/services/riskHubApi';

import { getRoleActionState } from './rolePermissions';

interface RolesTableProps {
    onDelete: (role: RoleHubRead) => void;
    onEdit: (role: RoleHubRead) => void;
    onRestore: (role: RoleHubRead) => void;
    roles: RoleHubRead[];
}

export function RolesTable({ onDelete, onEdit, onRestore, roles }: RolesTableProps) {
    const { t } = useTranslation(['admin', 'common', 'settings']);
    const format = useFormat();

    if (roles.length === 0) {
        return <EmptyState title={t('admin:roles_panel.empty')} testId="roles-empty" />;
    }

    return (
        <Table density="compact" regionLabel={t('admin:roles_panel.title')}>
            <THead>
                <TR>
                    <TH>{t('admin:roles_panel.columns.role_name')}</TH>
                    <TH>{t('admin:roles_panel.columns.permissions')}</TH>
                    <TH align="center">{t('admin:roles_panel.columns.users')}</TH>
                    <TH align="center">{t('common:labels.status')}</TH>
                    <TH align="right">{t('common:labels.actions')}</TH>
                </TR>
            </THead>
            <TBody>
                {roles.map((role) => {
                    const actions = getRoleActionState(role);
                    return (
                        <TR key={role.id} data-archived={role.is_active ? undefined : 'true'}>
                            <TD>
                                <div className="font-medium text-foreground">{role.display_name}</div>
                                <code className="text-xs text-muted-foreground font-mono">{role.name}</code>
                                {role.description && (
                                    <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{role.description}</div>
                                )}
                            </TD>
                            <TD>
                                <div className="flex flex-wrap gap-1 max-w-md">
                                    {renderPermissions(role, t)}
                                </div>
                            </TD>
                            <TD align="center">
                                <Badge tone="neutral" icon={Users}>{format.number(role.user_count)}</Badge>
                            </TD>
                            <TD align="center">
                                {renderStatus(role, t)}
                            </TD>
                            <TD align="right">
                                <div className="flex items-center justify-end gap-1">
                                    {/* GAP-B-03: the edit stays visible and explains why it is unavailable. */}
                                    <RowActionButton
                                        icon={Edit}
                                        label={t('common:actions.edit_named', { name: role.display_name })}
                                        onClick={() => onEdit(role)}
                                        disabledReason={actions.canUpdate
                                            ? undefined
                                            : t('admin:roles_panel.actions.edit_disabled', { role: role.display_name })}
                                    />

                                    {actions.canDelete && (
                                        <RowActionButton
                                            icon={Archive}
                                            tone="danger"
                                            label={t('common:actions.archive_named', { name: role.display_name })}
                                            onClick={() => onDelete(role)}
                                            // An assigned role cannot be archived; say so on the action.
                                            disabledReason={role.user_count > 0
                                                ? t('admin:roles_panel.cannot_archive_assigned', { count: role.user_count })
                                                : undefined}
                                        />
                                    )}

                                    {actions.canRestore && (
                                        <RowRestoreButton
                                            itemName={role.display_name}
                                            onClick={() => onRestore(role)}
                                        />
                                    )}
                                </div>
                            </TD>
                        </TR>
                    );
                })}
            </TBody>
        </Table>
    );
}

function renderPermissions(role: RoleHubRead, t: SafeTFunction) {
    if (role.name === 'admin') {
        return <Badge tone="info">{t('admin:roles_panel.badges.admin_permissions')}</Badge>;
    }

    if (role.permissions.includes('*:*')) {
        return <Badge tone="accent">{t('admin:roles_panel.badges.full_access')}</Badge>;
    }

    if (role.permissions.length === 0) {
        return <span className="text-xs text-muted-foreground italic">{t('labels.no_permissions')}</span>;
    }

    // PG-03: permissions read as task labels, never raw `resource:action` tokens.
    return role.permissions.map((permission) => (
        <Badge key={permission} tone="neutral">
            {getPermissionLabel(permission, t)}
        </Badge>
    ));
}

function renderStatus(role: RoleHubRead, t: SafeTFunction) {
    if (role.is_system) {
        return <Badge tone="info">{t('admin:roles_panel.badges.system')}</Badge>;
    }

    if (role.is_active) {
        return <Badge tone="success">{t('admin:roles_panel.badges.active')}</Badge>;
    }

    return <Badge tone="neutral">{t('admin:roles_panel.badges.deleted')}</Badge>;
}
