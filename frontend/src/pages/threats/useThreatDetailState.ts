import { useCallback } from 'react';
import { useParams } from 'react-router-dom';

import { resolveCapabilityFlag } from '@/lib/capabilities';
import { useDetailQuery } from '@/pages/detail/useDetailQuery';
import { logError } from '@/services/logger';
import { threatApi } from '@/services/threatApi';
import type { Threat } from '@/types/threat';

export type ThreatDetailMode = 'view' | 'new' | 'edit';

interface UseThreatDetailStateOptions {
    mode: ThreatDetailMode;
}

export function useThreatDetailState({ mode }: UseThreatDetailStateOptions) {
    const { id } = useParams<{ id: string }>();

    const {
        isRetrying,
        loadOutcome,
        refetch: fetchThreat,
        resource: threat,
        resourceId: threatId,
        setResource: setThreat,
    } = useDetailQuery<Threat>({
        enabled: mode !== 'new',
        entity: 'threat',
        rawId: id,
        load: (threatId) => threatApi.getThreat(threatId),
    });

    const restoreThreat = useCallback(async () => {
        if (!threat) {
            return;
        }
        try {
            await threatApi.restoreThreat(threat.id);
            await fetchThreat();
        } catch (restoreError) {
            logError('Error restoring threat:', restoreError);
        }
    }, [fetchThreat, threat]);

    return {
        canArchive: resolveCapabilityFlag(threat?.capabilities, 'can_archive'),
        canEdit: resolveCapabilityFlag(threat?.capabilities, 'can_update'),
        canRestore: resolveCapabilityFlag(threat?.capabilities, 'can_restore'),
        fetchThreat,
        isRetrying,
        loadOutcome,
        threat,
        threatId,
        setThreat,
        restoreThreat,
    };
}
