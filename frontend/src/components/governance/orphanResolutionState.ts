export function buildOrphanResolutionLabel(value: string | null | undefined, entityName: string): string {
    return value?.trim() || `Unknown ${entityName}`;
}

export function resolveOrphanStaleTarget({ stale }: { stale: boolean }) {
    return {
        canSubmit: !stale,
        errorKey: stale ? 'orphaned_items.errors.stale_target' : null,
    };
}
