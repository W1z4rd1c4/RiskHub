import { useCallback } from 'react';

import type { DetailActionMessage } from './DetailActionBanner';
import { useEntityDetailMutationWorkflow } from './useEntityDetailMutationWorkflow';

interface UseArchiveRestoreActionOptions {
    setMessage: (message: DetailActionMessage) => void;
    toErrorKey: (error: unknown) => string;
    /** See `useEntityDetailMutationWorkflow` (D12 / PM-2). */
    onApprovalQueued?: (response: unknown) => void;
    /** See `useEntityDetailMutationWorkflow` (D9 toast). */
    onSuccessMessage?: (message: DetailActionMessage) => void;
}

interface RunArchiveOptions {
    archive: () => Promise<unknown>;
    approvalKey: string;
    closeDialog?: () => void;
    isCurrent?: () => boolean;
    onImmediate: () => void | Promise<void>;
}

interface RunRestoreOptions {
    restore: () => Promise<unknown>;
    isCurrent?: () => boolean;
    successKey: string;
    onRestored: () => void | Promise<void>;
}

export function useArchiveRestoreAction({
    onApprovalQueued,
    onSuccessMessage,
    setMessage,
    toErrorKey,
}: UseArchiveRestoreActionOptions) {
    const { isMutating, runEntityMutation } = useEntityDetailMutationWorkflow({
        onApprovalQueued,
        onSuccessMessage,
        setMessage,
        toErrorKey,
    });

    const runArchive = useCallback(async ({
        approvalKey,
        archive,
        closeDialog,
        isCurrent,
        onImmediate,
    }: RunArchiveOptions) => {
        return runEntityMutation({
            approvalKey,
            closeDialog,
            execute: archive,
            isCurrent,
            onDirectSuccess: onImmediate,
        });
    }, [runEntityMutation]);

    const runRestore = useCallback(async ({
        onRestored,
        restore,
        isCurrent,
        successKey,
    }: RunRestoreOptions) => {
        return runEntityMutation({
            execute: restore,
            isCurrent,
            onDirectSuccess: onRestored,
            successKey,
        });
    }, [runEntityMutation]);

    return {
        isRunning: isMutating,
        runArchive,
        runRestore,
    };
}
