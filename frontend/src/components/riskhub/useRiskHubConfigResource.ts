import { useState } from 'react';
import { useResourcePanelQuery, type ResourceId } from '@/hooks/useResourcePanelQuery';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { useRestoreWithFeedback } from '@/pages/shared/useRestoreWithFeedback';
import { apiClient } from '@/services/apiClient';
import { useRiskHubConfigPanelState } from './useRiskHubConfigPanelState';

type CapabilityMap = Record<string, unknown> | null | undefined;
export type RiskHubConfigResourceDefinition<TItem, TCreate, TUpdate> = { queryKey: readonly unknown[]; load: (showInactive: boolean) => Promise<TItem[]>; create?: (data: TCreate) => Promise<unknown>; update?: (id: ResourceId, data: TUpdate) => Promise<unknown>; delete?: (id: ResourceId) => Promise<unknown>; restore?: (id: ResourceId) => Promise<unknown>; itemId: (item: TItem) => ResourceId; panelCapabilityKey?: string; includeShowInactive?: boolean };
export type RiskHubConfigActionModel = { canCreate: boolean; canUpdate: boolean; canDelete: boolean; canRestore: boolean; disabledReason: string | null };
export function buildRiskHubConfigActionModel(capabilities: CapabilityMap): RiskHubConfigActionModel {
    const canCreate = resolveCapabilityFlag(capabilities, 'can_create');
    return { canCreate, canDelete: resolveCapabilityFlag(capabilities, 'can_delete'), canRestore: resolveCapabilityFlag(capabilities, 'can_restore'), canUpdate: resolveCapabilityFlag(capabilities, 'can_update'), disabledReason: canCreate ? null : 'create_disabled' };
}
const missingMutation = (name: string) => () => { throw new Error(`${name} mutation is not configured`); };
function resourceQueryKey<TItem, TCreate, TUpdate>(definition: RiskHubConfigResourceDefinition<TItem, TCreate, TUpdate>, showInactive: boolean) {
    return definition.includeShowInactive === false ? definition.queryKey : [...definition.queryKey, showInactive];
}
export function useRiskHubConfigResource<TItem, TCreate, TUpdate>(definition: RiskHubConfigResourceDefinition<TItem, TCreate, TUpdate>) {
    const panel = useRiskHubConfigPanelState<TItem>();
    const [isDeleting, setIsDeleting] = useState(false);
    const restoreWithFeedback = useRestoreWithFeedback();
    const query = useResourcePanelQuery<TItem, TCreate, TUpdate>({
        create: definition.create ?? missingMutation('Create'),
        invalidateKey: definition.queryKey,
        list: () => definition.load(panel.showInactive),
        remove: definition.delete ?? missingMutation('Delete'),
        queryKey: resourceQueryKey(definition, panel.showInactive),
        restore: definition.restore ?? missingMutation('Restore'),
        update: definition.update ?? missingMutation('Update'),
    });
    async function handleSave(data: TCreate | TUpdate): Promise<void> {
        const id = panel.editingItem ? definition.itemId(panel.editingItem) : undefined;
        await query.handleSave({ id, payload: data });
    }
    async function handleDelete(): Promise<void> {
        if (!panel.deleteConfirm || isDeleting) return;
        setIsDeleting(true);
        try {
            await query.handleDelete(definition.itemId(panel.deleteConfirm));
            panel.closeDelete();
        } catch (error: unknown) {
            panel.setActionErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setIsDeleting(false);
        }
    }
    /** Row restore: the outcome is a toast (D9); a failure is never an unhandled rejection. */
    function handleRestore(item: TItem): void { void restoreWithFeedback({ restore: () => query.handleRestore(definition.itemId(item)), refresh: () => undefined }); }
    return {
        actionErrorKey: panel.actionErrorKey, closeDelete: panel.closeDelete, closeModal: panel.closeModal,
        deleteConfirm: panel.deleteConfirm, editingItem: panel.editingItem, error: query.error,
        handleDelete, handleRestore, handleSave, hasData: query.hasData, isDeleting, isFetching: query.isFetching,
        isLoading: query.isLoading, items: query.items, retry: () => { void query.refetch(); },
        modalOpen: panel.modalOpen, openCreate: panel.openCreate, openEdit: panel.openEdit,
        requestDelete: panel.requestDelete, setActionErrorKey: panel.setActionErrorKey,
        setDeleteConfirm: panel.setDeleteConfirm, setShowInactive: panel.setShowInactive, showInactive: panel.showInactive,
    };
}
