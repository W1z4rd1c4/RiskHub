/**
 * Approval UI Helpers
 * 
 * Utilities for handling 202 approval-queued responses from the backend.
 * Used by forms (RiskForm, ControlForm, KRIForm) to detect when an edit
 * requires approval instead of being applied immediately.
 */

export type ApprovalUiTFunction = (key: string) => string;

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

export interface ApprovalCreatedResponse {
    status: 'approval_required';
    approval_id: number;
    message: string;
    action_type: 'delete' | 'edit';
    pending_fields: string[];
    pending_changes?: Record<string, unknown> | null;
    primary_approver_id?: number | null;
    requires_privileged_approval?: boolean;
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

/**
 * Generate a user-friendly banner message for approval submissions.
 * 
 * @param approvalId - The approval request ID
 * @param t - Optional i18next translation function
 * @returns Formatted message string
 */
export function getApprovalBannerMessage(approvalId: number, t?: ApprovalUiTFunction): string {
    const prefix = t ? t('approval.submitted_for_approval') : 'Submitted for approval';
    return `${prefix} (ID: ${approvalId})`;
}
