import { useProtectedDetailState } from '@/pages/detail/useProtectedDetailState';
import { processApi } from '@/services/processApi';
import type { Process } from '@/types/process';

export type ProcessDetailMode = 'view' | 'new' | 'edit';

export function useProcessDetailState({ mode }: { mode: ProcessDetailMode }) {
    const {
        isRetrying, loadOutcome, refetch: fetchProcess, resource: process, resourceId: processId,
        restoreRecord: restoreProcess, canArchive, canEdit, canRestore, setResource: setProcess,
    } = useProtectedDetailState<Process>({
        mode, entity: 'process',
        load: (id, signal) => processApi.getProcess(id, { signal }),
        restore: (id) => processApi.restoreProcess(id), name: (record) => record.l1_process,
    });

    return {
        canArchive, canEdit, canRestore, fetchProcess, isRetrying, loadOutcome,
        process, processId, restoreProcess, setProcess,
    };
}
