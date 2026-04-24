import { useCallback, useState } from 'react';

import { isApprovalCreatedResponse } from '@/types/approval';

import type { DetailActionMessage } from './DetailActionBanner';

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
    const [isRunning, setIsRunning] = useState(false);

    const runArchive = useCallback(async ({
        approvalKey,
        archive,
        closeDialog,
        onImmediate,
    }: RunArchiveOptions) => {
        try {
            setIsRunning(true);
            const response = await archive();
            if (isApprovalCreatedResponse(response)) {
                setMessage({ key: approvalKey, isError: false });
                closeDialog?.();
                return;
            }
            await onImmediate();
        } catch (error) {
            setMessage({ key: toErrorKey(error), isError: true });
        } finally {
            setIsRunning(false);
        }
    }, [setMessage, toErrorKey]);

    const runRestore = useCallback(async ({
        onRestored,
        restore,
        successKey,
    }: RunRestoreOptions) => {
        try {
            setIsRunning(true);
            await restore();
            await onRestored();
            setMessage({ key: successKey, isError: false });
        } catch (error) {
            setMessage({ key: toErrorKey(error), isError: true });
        } finally {
            setIsRunning(false);
        }
    }, [setMessage, toErrorKey]);

    return {
        isRunning,
        runArchive,
        runRestore,
    };
}
