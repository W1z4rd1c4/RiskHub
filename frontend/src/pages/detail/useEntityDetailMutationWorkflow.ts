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
    /**
     * D12 / PM-2: called instead of `setMessage` when the mutation was routed
     * through approval (the caller raises the toast and the pending notice).
     */
    onApprovalQueued?: (response: unknown) => void;
    /** D9: called instead of `setMessage` for a direct success message (toast). */
    onSuccessMessage?: (message: DetailActionMessage) => void;
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
    onApprovalQueued,
    onSuccessMessage,
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
                if (onApprovalQueued) onApprovalQueued(response);
                else setMessage(message);
                closeDialog?.();
                return { kind: 'approval_queued', message, response };
            }

            await onDirectSuccess?.();
            if (!isCurrent()) {
                return { kind: 'superseded', response };
            }

            const message = successKey ? { key: successKey, isError: false } : null;
            if (message) {
                if (onSuccessMessage) onSuccessMessage(message);
                else setMessage(message);
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
    }, [onApprovalQueued, onSuccessMessage, setMessage, toErrorKey]);

    return {
        isMutating,
        runEntityMutation,
    };
}
