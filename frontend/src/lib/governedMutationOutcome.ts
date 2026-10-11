import { approvalRequestHref } from '@/pages/approvals/approvalNavigation';
import { ApiClientError } from '@/services/api/apiErrors';
import type { ApprovalCreatedResponse } from '@/types/approval';

/** Both legacy and proposal-bearing 202 envelopes share this discriminator. */
export function isApprovalCreatedResponse(response: unknown): response is ApprovalCreatedResponse {
    if (!response || typeof response !== 'object' || Array.isArray(response)) return false;
    const value = response as Record<string, unknown>;
    return value.status === 'approval_required'
        && typeof value.approval_id === 'number'
        && Number.isSafeInteger(value.approval_id)
        && value.approval_id > 0;
}

export type GovernedSuccess<T> =
    | { kind: 'applied'; response: Exclude<T, ApprovalCreatedResponse> }
    | { kind: 'pending'; response: Extract<T, ApprovalCreatedResponse>; approvalId: number; href: string };

export function governedMutationSuccess<T>(response: T): GovernedSuccess<T> {
    if (isApprovalCreatedResponse(response)) {
        return {
            kind: 'pending', response: response as Extract<T, ApprovalCreatedResponse>,
            approvalId: response.approval_id, href: approvalRequestHref(response.approval_id),
        };
    }
    if (response && typeof response === 'object' && 'status' in response && response.status === 'approval_required') {
        throw new ApiClientError({ code: 'INVALID_RESPONSE_PAYLOAD', messageKey: 'errors.request_failed' });
    }
    return { kind: 'applied', response: response as Exclude<T, ApprovalCreatedResponse> };
}

const PENDING_CODES = new Set([
    'process_pending_mutation', 'asset_pending_mutation', 'vendor_pending_mutation', 'threat_pending_mutation',
]);

export interface GovernedRejection {
    kind: 'rejected';
    error: unknown;
    message: 'request_reason_required' | 'pending_change_exists' | 'save_failed';
    field?: 'request_reason';
}

/** Localized keys, never server prose; forms retain their existing namespaces. */
export function governedMutationRejection(error: unknown): GovernedRejection {
    if (error instanceof ApiClientError) {
        if (error.status === 422 && error.code === 'governed_mutation_reason_required') {
            return { kind: 'rejected', error, message: 'request_reason_required', field: 'request_reason' };
        }
        if (error.code && PENDING_CODES.has(error.code)) {
            return { kind: 'rejected', error, message: 'pending_change_exists' };
        }
    }
    return { kind: 'rejected', error, message: 'save_failed' };
}

export interface SupersededMutation { kind: 'superseded' }
export type OwnedMutationOutcome<T> = GovernedSuccess<T> | SupersededMutation;
export type LinkMutationContinuation = void | OwnedMutationOutcome<unknown>;

/** Resolve only for the submitted owner generation; current failures still reject. */
export async function executeGovernedMutation<T>(
    execute: () => Promise<T>,
    isCurrent: () => boolean,
): Promise<OwnedMutationOutcome<T>> {
    try {
        const response = await execute();
        return isCurrent() ? governedMutationSuccess(response) : { kind: 'superseded' };
    } catch (error) {
        if (!isCurrent()) return { kind: 'superseded' };
        throw error;
    }
}
