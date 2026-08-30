import { useCallback } from 'react';
import { useParams } from 'react-router-dom';

import { resolveCapabilityFlag } from '@/lib/capabilities';
import { useDetailQuery } from '@/pages/detail/useDetailQuery';
import { logError } from '@/services/logger';
import { processApi } from '@/services/processApi';
import type { Process } from '@/types/process';

export type ProcessDetailMode = 'view' | 'new' | 'edit';

interface UseProcessDetailStateOptions {
    mode: ProcessDetailMode;
}

export function useProcessDetailState({ mode }: UseProcessDetailStateOptions) {
    const { id } = useParams<{ id: string }>();

    const {
        isRetrying,
        loadOutcome,
        refetch: fetchProcess,
        resource: process,
        resourceId: processId,
        setResource: setProcess,
    } = useDetailQuery<Process>({
        enabled: mode !== 'new',
        entity: 'process',
        rawId: id,
        load: (processId) => processApi.getProcess(processId),
    });

    const restoreProcess = useCallback(async () => {
        if (!process) {
            return;
        }
        try {
            await processApi.restoreProcess(process.id);
            await fetchProcess();
        } catch (restoreError) {
            logError('Error restoring process:', restoreError);
        }
    }, [fetchProcess, process]);

    return {
        canArchive: resolveCapabilityFlag(process?.capabilities, 'can_archive'),
        canEdit: resolveCapabilityFlag(process?.capabilities, 'can_update'),
        canRestore: resolveCapabilityFlag(process?.capabilities, 'can_restore'),
        fetchProcess,
        isRetrying,
        loadOutcome,
        process,
        processId,
        restoreProcess,
        setProcess,
    };
}
