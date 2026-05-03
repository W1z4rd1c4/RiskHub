import { useQuery } from '@tanstack/react-query';

import {
    riskHubApi,
    type RoleHubCreate,
    type RoleHubRead,
    type RoleHubUpdate,
} from '@/services/riskHubApi';
import { useRiskHubConfigResource } from '../useRiskHubConfigResource';

export function useRolesPanelData() {
    const rolesResource = useRiskHubConfigResource<RoleHubRead, RoleHubCreate, RoleHubUpdate>({
        queryKey: ['roles'],
        load: (showInactive) => riskHubApi.getRoles(showInactive),
        create: (data) => riskHubApi.createRole(data),
        update: (id, data) => riskHubApi.updateRole(Number(id), data),
        delete: (id) => riskHubApi.deleteRole(Number(id)),
        restore: (id) => riskHubApi.restoreRole(Number(id)),
        itemId: (role) => role.id,
        panelCapabilityKey: 'roles',
    });

    const permissionsQuery = useQuery({
        queryKey: ['permissions'],
        queryFn: () => riskHubApi.getPermissions(),
    });

    function openCreateModal() {
        rolesResource.openCreate();
    }

    function openEditModal(role: RoleHubRead) {
        rolesResource.openEdit(role);
    }

    function closeRoleModal() {
        rolesResource.closeModal();
    }

    function handleRestore(role: RoleHubRead) {
        rolesResource.handleRestore(role);
    }

    return {
        actionErrorKey: rolesResource.actionErrorKey,
        closeRoleModal,
        deleteConfirm: rolesResource.deleteConfirm,
        editingRole: rolesResource.editingItem,
        handleDelete: rolesResource.handleDelete,
        handleRestore,
        handleSave: rolesResource.handleSave,
        modalOpen: rolesResource.modalOpen,
        openCreateModal,
        openEditModal,
        permissions: permissionsQuery.data ?? [],
        permissionsLoading: permissionsQuery.isLoading,
        roles: rolesResource.items,
        rolesLoading: rolesResource.isLoading,
        setDeleteConfirm: rolesResource.setDeleteConfirm,
        setShowInactive: rolesResource.setShowInactive,
        showInactive: rolesResource.showInactive,
    };
}
