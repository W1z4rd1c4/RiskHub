import { useCallback, useState } from 'react';

import { isApprovalCreatedResponse } from '@/types/approval';

import type { DetailActionMessage } from './DetailActionBanner';

export type EntityDetailMutationOutcome =
    | { kind: 'approval_queued'; message: DetailActionMessage; response: unknown }
    | { kind: 'direct_success'; message: DetailActionMessage | null; response: unknown }
    | { kind: 'failed'; error: unknown; message: DetailActionMessage };

interface UseEntityDetailMutationWorkflowOptions {
    setMessage: (message: DetailActionMessage) => void;
    toErrorKey: (error: unknown) => string;
}

interface RunEntityMutationOptions {
    approvalKey?: string;
    closeDialog?: () => void;
    execute: () => Promise<unknown>;
    onDirectSuccess?: () => void | Promise<void>;
    successKey?: string;
}

export function useEntityDetailMutationWorkflow({
    setMessage,
    toErrorKey,
}: UseEntityDetailMutationWorkflowOptions) {
    const [isMutating, setIsMutating] = useState(false);

    const runEntityMutation = useCallback(async ({
        approvalKey,
        closeDialog,
        execute,
        onDirectSuccess,
        successKey,
    }: RunEntityMutationOptions): Promise<EntityDetailMutationOutcome> => {
        try {
            setIsMutating(true);
            const response = await execute();

            if (approvalKey && isApprovalCreatedResponse(response)) {
                const message = { key: approvalKey, isError: false };
                setMessage(message);
                closeDialog?.();
                return { kind: 'approval_queued', message, response };
            }

            await onDirectSuccess?.();

            const message = successKey ? { key: successKey, isError: false } : null;
            if (message) {
                setMessage(message);
            }
            return { kind: 'direct_success', message, response };
        } catch (error) {
            const message = { key: toErrorKey(error), isError: true };
            setMessage(message);
            return { kind: 'failed', error, message };
        } finally {
            setIsMutating(false);
        }
    }, [setMessage, toErrorKey]);

    return {
        isMutating,
        runEntityMutation,
    };
}
