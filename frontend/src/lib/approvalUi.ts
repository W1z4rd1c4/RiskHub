/**
 * Approval UI Helpers
 * 
 * Utilities for handling 202 approval-queued responses from the backend.
 * Used by forms (RiskForm, ControlForm, KRIForm) to detect when an edit
 * requires approval instead of being applied immediately.
 */
import type { ApprovalCreatedResponse } from '@/types/approval';

/**
 * Type guard to check if a response is an approval-created response
 */
export function isApprovalCreatedResponse(response: unknown): response is ApprovalCreatedResponse {
    return (
        typeof response === 'object' &&
        response !== null &&
        'status' in response &&
        'approval_id' in response &&
        typeof (response as { approval_id: unknown }).approval_id === 'number'
    );
}

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
    if (isApprovalCreatedResponse(response)) {
        return {
            kind: 'approval',
            approvalId: response.approval_id,
            message: response.message,
        };
    }
    return { kind: 'applied' };
}
