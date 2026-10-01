import { AlertCircle, Plus, Shield } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';

import { RoleDeleteDialog } from './roles/RoleDeleteDialog';
import { RoleModal } from './roles/RoleModal';
import { RolesTable } from './roles/RolesTable';
import { useRolesPanelData } from './roles/useRolesPanelData';
import { riskHubCapabilityEnabled, useRiskHubCapabilities } from './useRiskHubCapabilities';

export function RolesPanel() {
    const { t } = useTranslation(['admin', 'common']);
    const rolesPanel = useRolesPanelData();
    const { data: riskHubCapabilities } = useRiskHubCapabilities();
    const canCreate = riskHubCapabilityEnabled(riskHubCapabilities?.roles, 'can_create');

    if (rolesPanel.rolesLoading) {
        return <div className="text-muted-foreground text-center py-8">{t('common:loading.roles')}</div>;
    }

    return (
        <div className="space-y-4">
            {rolesPanel.actionErrorKey && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                    <AlertCircle className="h-4 w-4" />
                    {t(rolesPanel.actionErrorKey, { ns: 'errorKeys' })}
                </div>
            )}

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-accent" />
                    <h3 className="text-lg font-semibold text-foreground">{t('admin:roles_panel.title')}</h3>
                </div>

                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                            type="checkbox"
                            checked={rolesPanel.showInactive}
                            onChange={(event) => rolesPanel.setShowInactive(event.target.checked)}
                            className="rounded border-input bg-tint/5 accent-accent focus:ring-accent"
                        />
                        {t('admin:roles_panel.show_deleted')}
                    </label>

                    {canCreate ? (
                        <button
                            onClick={rolesPanel.openCreateModal}
                            className="flex items-center gap-2 px-3 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent-hover transition-colors"
                        >
                            <Plus className="h-4 w-4" />
                            {t('admin:roles_panel.add_role')}
                        </button>
                    ) : null}
                </div>
            </div>

            <RolesTable
                onDelete={rolesPanel.setDeleteConfirm}
                onEdit={rolesPanel.openEditModal}
                onRestore={rolesPanel.handleRestore}
                roles={rolesPanel.roles}
            />

            <RoleModal
                allPermissions={rolesPanel.permissions}
                isOpen={rolesPanel.modalOpen}
                onClose={rolesPanel.closeRoleModal}
                onSave={rolesPanel.handleSave}
                permissionsLoading={rolesPanel.permissionsLoading}
                role={rolesPanel.editingRole}
            />

            <RoleDeleteDialog
                onCancel={() => rolesPanel.setDeleteConfirm(null)}
                onConfirm={rolesPanel.handleDelete}
                role={rolesPanel.deleteConfirm}
            />
        </div>
    );
}
