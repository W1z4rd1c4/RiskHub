import { useCallback, useState } from 'react';

import { isApprovalCreatedResponse } from '@/types/approval';

import type { DetailActionMessage } from './DetailActionBanner';

export type EntityDetailMutationOutcome =
    | { kind: 'approval_queued'; message: DetailActionMessage; response: unknown }
    | { kind: 'direct_success'; message: DetailActionMessage | null; response: unknown }
    | { kind: 'superseded'; response?: unknown; error?: unknown }
    | { kind: 'failed'; error: unknown; message: DetailActionMessage };

interface UseEntityDetailMutationWorkflowOptions {
    setMessage: (message: DetailActionMessage) => void;
    toErrorKey: (error: unknown) => string;
}

interface RunEntityMutationOptions {
    approvalKey?: string;
    closeDialog?: () => void;
    execute: () => Promise<unknown>;
    isCurrent?: () => boolean;
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
        isCurrent = () => true,
        onDirectSuccess,
        successKey,
    }: RunEntityMutationOptions): Promise<EntityDetailMutationOutcome> => {
        try {
            setIsMutating(true);
            const response = await execute();
            if (!isCurrent()) {
                return { kind: 'superseded', response };
            }

            if (approvalKey && isApprovalCreatedResponse(response)) {
                const message = { key: approvalKey, isError: false };
                setMessage(message);
                closeDialog?.();
                return { kind: 'approval_queued', message, response };
            }

            await onDirectSuccess?.();
            if (!isCurrent()) {
                return { kind: 'superseded', response };
            }

            const message = successKey ? { key: successKey, isError: false } : null;
            if (message) {
                setMessage(message);
            }
            return { kind: 'direct_success', message, response };
        } catch (error) {
            if (!isCurrent()) {
                return { kind: 'superseded', error };
            }
            const message = { key: toErrorKey(error), isError: true };
            setMessage(message);
            return { kind: 'failed', error, message };
        } finally {
            if (isCurrent()) {
                setIsMutating(false);
            }
        }
    }, [setMessage, toErrorKey]);

    return {
        isMutating,
        runEntityMutation,
    };
}
