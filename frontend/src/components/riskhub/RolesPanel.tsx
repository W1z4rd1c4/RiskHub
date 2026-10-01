import { Plus, Shield } from 'lucide-react';

import { InlineMessage } from '@/components/ui/inline-message';
import { translateUiMessage, useTranslation } from '@/i18n/hooks';

import { RoleDeleteDialog } from './roles/RoleDeleteDialog';
import { RoleModal } from './roles/RoleModal';
import { RolesTable } from './roles/RolesTable';
import { useRolesPanelData } from './roles/useRolesPanelData';
import { riskHubCapabilityEnabled, useRiskHubCapabilities } from './useRiskHubCapabilities';
import { ErrorState, LoadingState } from '@/components/ui/state';

export function RolesPanel() {
    const { t } = useTranslation(['admin', 'common']);
    const rolesPanel = useRolesPanelData();
    const { data: riskHubCapabilities } = useRiskHubCapabilities();
    const canCreate = riskHubCapabilityEnabled(riskHubCapabilities?.roles, 'can_create');

    if (rolesPanel.rolesLoading) {
        return <LoadingState label={t('common:loading.roles')} />;
    }
    if (rolesPanel.rolesError && !rolesPanel.rolesHasData) {
        return <ErrorState onRetry={rolesPanel.retryRoles} isRetrying={rolesPanel.rolesRefetching} />;
    }

    return (
        <div className="space-y-4">
            {rolesPanel.actionErrorKey && !rolesPanel.deleteConfirm && (
                <InlineMessage tone="danger">{translateUiMessage(t, rolesPanel.actionErrorKey)}</InlineMessage>
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
                permissionsLoadFailed={rolesPanel.permissionsLoadFailed}
                permissionsRefetching={rolesPanel.permissionsRefetching}
                onRetryPermissions={rolesPanel.retryPermissions}
                role={rolesPanel.editingRole}
            />

            <RoleDeleteDialog
                onCancel={rolesPanel.closeDelete}
                onConfirm={() => void rolesPanel.handleDelete()}
                role={rolesPanel.deleteConfirm}
                isBusy={rolesPanel.isDeleting}
                errorText={translateUiMessage(t, rolesPanel.actionErrorKey) || null}
            />
        </div>
    );
}
