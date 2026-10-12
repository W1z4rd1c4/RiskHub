
import { useProtectedDetailState } from '@/pages/detail/useProtectedDetailState';
import { threatApi } from '@/services/threatApi';
import type { Threat } from '@/types/threat';

export type ThreatDetailMode = 'view' | 'new' | 'edit';

interface UseThreatDetailStateOptions {
    mode: ThreatDetailMode;
}

export function useThreatDetailState({ mode }: UseThreatDetailStateOptions) {

    const {
        isRetrying, loadOutcome, refetch: fetchThreat, resource: threat, resourceId: threatId,
        restoreRecord: restoreThreat, canArchive, canEdit, canRestore,
        setResource: setThreat,
    } = useProtectedDetailState<Threat>({
        mode, entity: 'threat',
        load: (id, signal) => threatApi.getThreat(id, { signal }),
        restore: threatApi.restoreThreat, name: (record) => record.name,
    });

    return {
        canArchive,
        canEdit,
        canRestore,
        fetchThreat,
        isRetrying,
        loadOutcome,
        threat,
        threatId,
        setThreat,
        restoreThreat,
    };
}
