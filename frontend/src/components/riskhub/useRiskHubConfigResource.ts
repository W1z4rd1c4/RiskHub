import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { resolveCapabilityFlag } from '@/lib/capabilities';
import { apiClient } from '@/services/apiClient';

import { useRiskHubConfigPanelState } from './useRiskHubConfigPanelState';

type QueryKey = readonly unknown[];
type CapabilityMap = Record<string, unknown> | null | undefined;
type ResourceId = number | string;

export type RiskHubConfigResourceDefinition<TItem, TCreate, TUpdate> = {
    queryKey: QueryKey;
    load: (showInactive: boolean) => Promise<TItem[]>;
    create?: (data: TCreate) => Promise<unknown>;
    update?: (id: ResourceId, data: TUpdate) => Promise<unknown>;
    delete?: (id: ResourceId) => Promise<unknown>;
    restore?: (id: ResourceId) => Promise<unknown>;
    itemId: (item: TItem) => ResourceId;
    panelCapabilityKey?: string;
    includeShowInactive?: boolean;
};

export type RiskHubConfigActionModel = {
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
    canRestore: boolean;
    disabledReason: string | null;
};

export type RiskHubConfigResourceState<TItem, TCreate, TUpdate> = {
    actionErrorKey: string | null;
    closeDelete: () => void;
    closeModal: () => void;
    deleteConfirm: TItem | null;
    editingItem: TItem | null;
    error: Error | null;
    handleDelete: () => Promise<void>;
    handleRestore: (item: TItem) => void;
    handleSave: (data: TCreate | TUpdate) => Promise<void>;
    isLoading: boolean;
    items: TItem[];
    modalOpen: boolean;
    openCreate: () => void;
    openEdit: (item: TItem) => void;
    requestDelete: (item: TItem) => void;
    setActionErrorKey: (errorKey: string | null) => void;
    setDeleteConfirm: (item: TItem | null) => void;
    setShowInactive: (showInactive: boolean) => void;
    showInactive: boolean;
};

export function buildRiskHubConfigActionModel(capabilities: CapabilityMap): RiskHubConfigActionModel {
    const canCreate = resolveCapabilityFlag(capabilities, 'can_create');
    const canUpdate = resolveCapabilityFlag(capabilities, 'can_update');
    const canDelete = resolveCapabilityFlag(capabilities, 'can_delete');
    const canRestore = resolveCapabilityFlag(capabilities, 'can_restore');

    return {
        canCreate,
        canDelete,
        canRestore,
        canUpdate,
        disabledReason: canCreate ? null : 'create_disabled',
    };
}

function resourceQueryKey(
    definition: RiskHubConfigResourceDefinition<unknown, unknown, unknown>,
    showInactive: boolean,
): QueryKey {
    if (definition.includeShowInactive === false) {
        return definition.queryKey;
    }
    return [...definition.queryKey, showInactive];
}

export function useRiskHubConfigResource<TItem, TCreate, TUpdate>(
    definition: RiskHubConfigResourceDefinition<TItem, TCreate, TUpdate>,
): RiskHubConfigResourceState<TItem, TCreate, TUpdate> {
    const queryClient = useQueryClient();
    const panel = useRiskHubConfigPanelState<TItem>();

    const itemsQuery = useQuery({
        queryKey: resourceQueryKey(definition, panel.showInactive),
        queryFn: () => definition.load(panel.showInactive),
    });

    const createMutation = useMutation({
        mutationFn: (data: TCreate) => {
            if (!definition.create) {
                throw new Error('Create mutation is not configured');
            }
            return definition.create(data);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: definition.queryKey }),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: ResourceId; data: TUpdate }) => {
            if (!definition.update) {
                throw new Error('Update mutation is not configured');
            }
            return definition.update(id, data);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: definition.queryKey }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => {
            if (!definition.delete) {
                throw new Error('Delete mutation is not configured');
            }
            return definition.delete(id);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: definition.queryKey }),
    });

    const restoreMutation = useMutation({
        mutationFn: (id: number) => {
            if (!definition.restore) {
                throw new Error('Restore mutation is not configured');
            }
            return definition.restore(id);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: definition.queryKey }),
    });

    async function handleSave(data: TCreate | TUpdate): Promise<void> {
        if (panel.editingItem) {
            await updateMutation.mutateAsync({
                id: definition.itemId(panel.editingItem),
                data: data as TUpdate,
            });
            return;
        }
        await createMutation.mutateAsync(data as TCreate);
    }

    async function handleDelete(): Promise<void> {
        if (!panel.deleteConfirm) {
            return;
        }

        try {
            await deleteMutation.mutateAsync(definition.itemId(panel.deleteConfirm));
            panel.closeDelete();
        } catch (error: unknown) {
            panel.setActionErrorKey(apiClient.toUiMessageKey(error));
        }
    }

    function handleRestore(item: TItem): void {
        restoreMutation.mutate(definition.itemId(item));
    }

    return {
        actionErrorKey: panel.actionErrorKey,
        closeDelete: panel.closeDelete,
        closeModal: panel.closeModal,
        deleteConfirm: panel.deleteConfirm,
        editingItem: panel.editingItem,
        error: itemsQuery.error,
        handleDelete,
        handleRestore,
        handleSave,
        isLoading: itemsQuery.isLoading,
        items: itemsQuery.data ?? [],
        modalOpen: panel.modalOpen,
        openCreate: panel.openCreate,
        openEdit: panel.openEdit,
        requestDelete: panel.requestDelete,
        setActionErrorKey: panel.setActionErrorKey,
        setDeleteConfirm: panel.setDeleteConfirm,
        setShowInactive: panel.setShowInactive,
        showInactive: panel.showInactive,
    };
}
