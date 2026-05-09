import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export type ResourceId = number | string;

export interface ResourcePanelQueryDefinition<TItem, TCreate, TUpdate> {
    queryKey: readonly unknown[];
    invalidateKey?: readonly unknown[];
    list: (signal?: AbortSignal) => Promise<TItem[]>;
    create: (payload: TCreate) => Promise<unknown>;
    update: (id: ResourceId, payload: TUpdate) => Promise<unknown>;
    remove: (id: ResourceId) => Promise<unknown>;
    restore: (id: ResourceId) => Promise<unknown>;
}

export function useResourcePanelQuery<TItem, TCreate, TUpdate>(
    definition: ResourcePanelQueryDefinition<TItem, TCreate, TUpdate>,
) {
    const queryClient = useQueryClient();
    const itemsQuery = useQuery({
        queryKey: definition.queryKey,
        queryFn: ({ signal }) => definition.list(signal),
    });
    const invalidate = useCallback(
        () => queryClient.invalidateQueries({ queryKey: definition.invalidateKey ?? definition.queryKey }),
        [definition, queryClient],
    );

    const handleSave = useCallback(async (input: { id?: ResourceId; payload: TCreate | TUpdate }) => {
        if (input.id === undefined) {
            await definition.create(input.payload as TCreate);
        } else {
            await definition.update(input.id, input.payload as TUpdate);
        }
        await invalidate();
    }, [definition, invalidate]);

    const handleDelete = useCallback(async (id: ResourceId) => {
        await definition.remove(id);
        await invalidate();
    }, [definition, invalidate]);

    const handleRestore = useCallback(async (id: ResourceId) => {
        await definition.restore(id);
        await invalidate();
    }, [definition, invalidate]);

    return {
        error: itemsQuery.error,
        handleDelete,
        handleRestore,
        handleSave,
        isLoading: itemsQuery.isLoading,
        items: itemsQuery.data ?? [],
    };
}
