export type CollectionViewGroupMap<TViewMode extends string> = Partial<Record<TViewMode, string | null>>;

export function getCollectionGroupBy<TViewMode extends string>(
    viewMode: TViewMode,
    groups: CollectionViewGroupMap<TViewMode>
): string | null {
    return groups[viewMode] ?? null;
}

export function resetCollectionGroupAndPage(
    resetGroupSelection: () => void,
    setCurrentPage: (page: number) => void
): void {
    resetGroupSelection();
    setCurrentPage(1);
}
