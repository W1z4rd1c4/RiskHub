import { useMutation } from '@tanstack/react-query';
import { executeGovernedMutation, type GovernedSuccess, type OwnedMutationOutcome } from '@/lib/governedMutationOutcome';
import { logError } from '@/services/logger';
import { useMutationOwner } from './useMutationOwner';

interface Options<TResponse, TVariables> {
    mutationFn: (variables: TVariables) => Promise<TResponse>;
    onMutate?: (variables: TVariables) => void;
    onSuccess?: (outcome: GovernedSuccess<TResponse>, variables: TVariables, isCurrent: () => boolean) => void | Promise<void>;
    onError?: (error: unknown, variables: TVariables) => void | Promise<void>;
}

/** Owns response classification and submission snapshots, not family policy. */
export function useOwnedGovernedMutation<TResponse, TVariables = void>(
    ownerKey: number,
    options: Options<TResponse, TVariables>,
) {
    const owner = useMutationOwner(ownerKey);
    type Invocation = {
        epoch: typeof owner.epoch;
        isCurrent: () => boolean;
        variables: TVariables;
        options: Options<TResponse, TVariables>;
    };
    const mutation = useMutation<OwnedMutationOutcome<TResponse>, unknown, Invocation>({
        mutationFn: (invocation) => executeGovernedMutation(
            () => invocation.options.mutationFn(invocation.variables), invocation.isCurrent,
        ),
        onMutate: (invocation) => {
            if (invocation.isCurrent()) invocation.options.onMutate?.(invocation.variables);
        },
        onSuccess: async (outcome, invocation) => {
            if (outcome.kind === 'superseded' || !invocation.isCurrent()) return;
            try {
                await invocation.options.onSuccess?.(outcome, invocation.variables, invocation.isCurrent);
            } catch (error) {
                // A refresh/presentation failure cannot turn an applied mutation
                // into a rejected backend outcome or invite a duplicate retry.
                if (invocation.isCurrent()) logError('Link outcome continuation failed:', error);
            }
        },
        onError: async (error, invocation) => {
            if (invocation.isCurrent()) await invocation.options.onError?.(error, invocation.variables);
        },
    });
    const snapshot = (variables: TVariables): Invocation => ({
        epoch: owner.epoch,
        isCurrent: owner.capture(),
        variables: structuredClone(variables),
        // Callbacks close over the submitted render, never a later selection.
        options,
    });
    return {
        ...mutation,
        isPending: mutation.isPending && mutation.variables?.epoch === owner.epoch,
        variables: mutation.variables?.variables,
        mutate: (variables: TVariables) => mutation.mutate(snapshot(variables)),
        mutateAsync: async (variables: TVariables): Promise<OwnedMutationOutcome<TResponse>> => {
            const invocation = snapshot(variables);
            const outcome = await mutation.mutateAsync(invocation);
            return invocation.isCurrent() ? outcome : { kind: 'superseded' };
        },
    };
}
