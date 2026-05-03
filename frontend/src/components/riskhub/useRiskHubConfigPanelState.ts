import { useState } from 'react';

export function useRiskHubConfigPanelState<TItem>() {
    const [showInactive, setShowInactive] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<TItem | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<TItem | null>(null);
    const [actionErrorKey, setActionErrorKey] = useState<string | null>(null);

    function openCreate(): void {
        setEditingItem(null);
        setModalOpen(true);
    }

    function openEdit(item: TItem): void {
        setEditingItem(item);
        setModalOpen(true);
    }

    function closeModal(): void {
        setModalOpen(false);
        setEditingItem(null);
    }

    function requestDelete(item: TItem): void {
        setActionErrorKey(null);
        setDeleteConfirm(item);
    }

    function closeDelete(): void {
        setDeleteConfirm(null);
        setActionErrorKey(null);
    }

    return {
        actionErrorKey,
        closeDelete,
        closeModal,
        deleteConfirm,
        editingItem,
        modalOpen,
        openCreate,
        openEdit,
        requestDelete,
        setActionErrorKey,
        setDeleteConfirm,
        setShowInactive,
        showInactive,
    };
}
