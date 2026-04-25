import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { apiClient } from '@/services/apiClient';
import {
    riskHubApi,
    type RoleHubCreate,
    type RoleHubRead,
    type RoleHubUpdate,
} from '@/services/riskHubApi';

export function useRolesPanelData() {
    const queryClient = useQueryClient();
    const [actionErrorKey, setActionErrorKey] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<RoleHubRead | null>(null);
    const [editingRole, setEditingRole] = useState<RoleHubRead | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [showInactive, setShowInactive] = useState(false);

    const rolesQuery = useQuery({
        queryKey: ['roles', showInactive],
        queryFn: () => riskHubApi.getRoles(showInactive),
    });

    const permissionsQuery = useQuery({
        queryKey: ['permissions'],
        queryFn: () => riskHubApi.getPermissions(),
    });

    const createMutation = useMutation({
        mutationFn: (data: RoleHubCreate) => riskHubApi.createRole(data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: RoleHubUpdate }) => riskHubApi.updateRole(id, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => riskHubApi.deleteRole(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
    });

    const restoreMutation = useMutation({
        mutationFn: (id: number) => riskHubApi.restoreRole(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
    });

    function openCreateModal() {
        setEditingRole(null);
        setModalOpen(true);
    }

    function openEditModal(role: RoleHubRead) {
        setEditingRole(role);
        setModalOpen(true);
    }

    function closeRoleModal() {
        setModalOpen(false);
        setEditingRole(null);
    }

    async function handleSave(data: RoleHubCreate | RoleHubUpdate) {
        if (editingRole) {
            await updateMutation.mutateAsync({ id: editingRole.id, data: data as RoleHubUpdate });
            return;
        }
        await createMutation.mutateAsync(data as RoleHubCreate);
    }

    async function handleDelete() {
        if (!deleteConfirm) {
            return;
        }

        try {
            await deleteMutation.mutateAsync(deleteConfirm.id);
            setDeleteConfirm(null);
        } catch (error: unknown) {
            setActionErrorKey(apiClient.toUiMessageKey(error));
        }
    }

    function handleRestore(role: RoleHubRead) {
        restoreMutation.mutate(role.id);
    }

    return {
        actionErrorKey,
        closeRoleModal,
        deleteConfirm,
        editingRole,
        handleDelete,
        handleRestore,
        handleSave,
        modalOpen,
        openCreateModal,
        openEditModal,
        permissions: permissionsQuery.data ?? [],
        permissionsLoading: permissionsQuery.isLoading,
        roles: rolesQuery.data ?? [],
        rolesLoading: rolesQuery.isLoading,
        setDeleteConfirm,
        setShowInactive,
        showInactive,
    };
}
