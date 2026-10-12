import { useCallback, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';

import { useMutationOwner } from '@/hooks/useMutationOwner';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { getSessionSnapshot, useSessionSnapshot } from '@/services/session';

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
    const session = useSessionSnapshot();
    const detail = useDetailQuery({ enabled: mode !== 'new', entity, rawId: id, load });
    const owner = useMutationOwner(JSON.stringify([session.user?.id, session.token, location.pathname, detail.resourceId]));
    const pending = useMemo(() => ({ value: false }), [owner.epoch]);
    const restoreWithFeedback = useRestoreWithFeedback();
    const { resource, refetch } = detail;
    const restoreRecord = useCallback(async () => {
        if (!resource || pending.value) return;
        const ownsRoute = owner.capture();
        const isCurrent = () => {
            const current = getSessionSnapshot();
            return ownsRoute() && current.user?.id === session.user?.id && current.token === session.token;
        };
        pending.value = true;
        try {
            await restoreWithFeedback({
                restore: () => restore(resource.id), name: name(resource), refresh: refetch, isCurrent,
            });
        } finally {
            pending.value = false;
        }
    }, [name, owner, pending, refetch, resource, restore, restoreWithFeedback, session.token, session.user?.id]);
    return {
        ...detail, restoreRecord,
        canArchive: resolveCapabilityFlag(resource?.capabilities, 'can_archive'),
        canEdit: resolveCapabilityFlag(resource?.capabilities, 'can_update'),
        canRestore: resolveCapabilityFlag(resource?.capabilities, 'can_restore'),
    };
}
