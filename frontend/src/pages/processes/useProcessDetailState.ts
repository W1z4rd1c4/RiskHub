import { useCallback } from 'react';
import { useParams } from 'react-router-dom';

import { resolveCapabilityFlag } from '@/lib/capabilities';
import { useDetailQuery } from '@/pages/detail/useDetailQuery';
import { useRestoreWithFeedback } from '@/pages/shared/useRestoreWithFeedback';
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

    const restoreWithFeedback = useRestoreWithFeedback();
    const restoreProcess = useCallback(async () => {
        if (!process) {
            return;
        }
        // D9: restore outcomes (success and failure) are toasts.
        const restored = process;
        await restoreWithFeedback({
            restore: () => processApi.restoreProcess(restored.id),
            name: restored.l1_process,
            refresh: () => fetchProcess(),
        });
    }, [fetchProcess, restoreWithFeedback, process]);

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
