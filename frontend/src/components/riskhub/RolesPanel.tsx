import { Plus, Shield } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CardHeader } from '@/components/ui/card';
import { InlineMessage } from '@/components/ui/inline-message';
import { translateUiMessage, useTranslation } from '@/i18n/hooks';

import { RiskHubShowArchivedToggle } from './panelPrimitives';
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
            {rolesPanel.rolesError ? (
                <ErrorState variant="banner" onRetry={rolesPanel.retryRoles} isRetrying={rolesPanel.rolesRefetching} />
            ) : null}
            {rolesPanel.actionErrorKey && !rolesPanel.deleteConfirm && (
                <InlineMessage tone="danger">{translateUiMessage(t, rolesPanel.actionErrorKey)}</InlineMessage>
            )}

            <CardHeader
                className="mb-0"
                icon={Shield}
                title={t('admin:roles_panel.title')}
                actions={(
                    <>
                        <RiskHubShowArchivedToggle
                            checked={rolesPanel.showInactive}
                            onCheckedChange={rolesPanel.setShowInactive}
                            label={t('admin:roles_panel.show_deleted')}
                        />
                        {canCreate ? (
                            <Button variant="accent" onClick={rolesPanel.openCreateModal}>
                                <Plus aria-hidden="true" />
                                {t('admin:roles_panel.add_role')}
                            </Button>
                        ) : null}
                    </>
                )}
            />

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
