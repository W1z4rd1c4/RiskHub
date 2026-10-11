/**
 * Approval UI Helpers
 * 
 * Utilities for handling 202 approval-queued responses from the backend.
 * Used by forms (RiskForm, ControlForm, KRIForm) to detect when an edit
 * requires approval instead of being applied immediately.
 */
import { governedMutationSuccess } from './governedMutationOutcome';
import type { ApprovalCreatedResponse } from '@/types/approval';
export { isApprovalCreatedResponse } from './governedMutationOutcome';

export type ParseResult =
    | { kind: 'applied' }
    | { kind: 'approval'; approvalId: number; message: string };

/**
 * Parse an update result and determine if it was applied or queued for approval.
 * 
 * @param response - The response from an update API call
 * @returns ParseResult indicating whether change was applied or queued
 */
export function parseUpdateResult(response: unknown): ParseResult {
    const outcome = governedMutationSuccess<ApprovalCreatedResponse | unknown>(response);
    if (outcome.kind === 'pending') {
        return {
            kind: 'approval',
            approvalId: outcome.approvalId,
            message: (response as ApprovalCreatedResponse).message,
        };
    }
    return { kind: 'applied' };
}
