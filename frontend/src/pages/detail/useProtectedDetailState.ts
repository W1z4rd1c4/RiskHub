import { useCallback, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';

import { useSessionMutationOwner } from '@/hooks/useMutationOwner';
import { resolveCapabilityFlag } from '@/lib/capabilities';

import { useRestoreWithFeedback } from '../shared/useRestoreWithFeedback';
import { useDetailQuery } from './useDetailQuery';

export type ProtectedDetailMode = 'view' | 'new' | 'edit';
interface RestorableRecord {
    id: number;
    capabilities?: { can_archive: boolean; can_update: boolean; can_restore: boolean } | null;
}
interface ProtectedDetailOptions<T> {
    mode: ProtectedDetailMode;
    entity: string;
    load: (id: number, signal?: AbortSignal) => Promise<T>;
    restore: (id: number) => Promise<unknown>;
    name: (record: T) => string;
}

/** One read/cache/restore lifecycle; entity adapters supply their existing APIs. */
export function useProtectedDetailState<T extends RestorableRecord>({ mode, entity, load, restore, name }: ProtectedDetailOptions<T>) {
    const { id } = useParams<{ id: string }>();
    const location = useLocation();
    const detail = useDetailQuery({ enabled: mode !== 'new', entity, rawId: id, load });
    const owner = useSessionMutationOwner(JSON.stringify([location.pathname, location.search, location.hash, detail.resourceId]));
    const pending = useMemo(() => ({ epoch: owner.epoch, value: false }), [owner.epoch]);
    const restoreWithFeedback = useRestoreWithFeedback();
    const { resource, refetch } = detail;
    const restoreRecord = useCallback(async () => {
        if (!resource || pending.value) return;
        const isCurrent = owner.capture();
        pending.value = true;
        try {
            await restoreWithFeedback({
                targetId: resource.id, restore: () => restore(resource.id), name: name(resource), refresh: refetch, isCurrent,
            });
        } finally {
            pending.value = false;
        }
    }, [name, owner, pending, refetch, resource, restore, restoreWithFeedback]);
    return {
        ...detail, restoreRecord,
        canArchive: resolveCapabilityFlag(resource?.capabilities, 'can_archive'),
        canEdit: resolveCapabilityFlag(resource?.capabilities, 'can_update'),
        canRestore: resolveCapabilityFlag(resource?.capabilities, 'can_restore'),
    };
}
