import { useCallback } from 'react';

import type { DetailActionMessage } from './DetailActionBanner';
import { useEntityDetailMutationWorkflow } from './useEntityDetailMutationWorkflow';

interface UseArchiveRestoreActionOptions {
    setMessage: (message: DetailActionMessage) => void;
    toErrorKey: (error: unknown) => string;
}

interface RunArchiveOptions {
    archive: () => Promise<unknown>;
    approvalKey: string;
    closeDialog?: () => void;
    onImmediate: () => void | Promise<void>;
}

interface RunRestoreOptions {
    restore: () => Promise<unknown>;
    successKey: string;
    onRestored: () => void | Promise<void>;
}

export function useArchiveRestoreAction({
    setMessage,
    toErrorKey,
}: UseArchiveRestoreActionOptions) {
    const { isMutating, runEntityMutation } = useEntityDetailMutationWorkflow({
        setMessage,
        toErrorKey,
    });

    const runArchive = useCallback(async ({
        approvalKey,
        archive,
        closeDialog,
        onImmediate,
    }: RunArchiveOptions) => {
        await runEntityMutation({
            approvalKey,
            closeDialog,
            execute: archive,
            onDirectSuccess: onImmediate,
        });
    }, [runEntityMutation]);

    const runRestore = useCallback(async ({
        onRestored,
        restore,
        successKey,
    }: RunRestoreOptions) => {
        await runEntityMutation({
            execute: restore,
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
