import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useFeedback } from '@/hooks/useFeedback';
import { useTranslation } from '@/i18n/hooks';

/**
 * D12 / PM-2 approval-queued rule (audit 2026-09-30 §4.16): when a submit is
 * routed through approval the user returns to (or stays on) the entity page,
 * which shows a persistent pending notice linking to `/approvals`
 * (`components/approvals/ApprovalQueuedNotice`), and a success toast confirms
 * the submission. The notice is carried in router state so it survives
 * re-renders and history navigation without a page-level store.
 */
const APPROVAL_QUEUED_STATE_KEY = 'approvalQueued';

export interface ApprovalQueuedNoticeState {
    /** Approval request id for the `/approvals` deep link, when known. */
    approvalId: number | null;
}

export interface AnnounceApprovalQueuedOptions {
    approvalId?: number | null;
    /**
     * Entity page to return to (edit/create flows). Omit to stay on the
     * current page (detail-page archive and link actions).
     */
    to?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `approval_id` of an approval-queued API response, when it carries one. */
export function approvalIdFromResponse(response: unknown): number | null {
    if (!isRecord(response)) return null;
    const { approval_id: approvalId } = response;
    return typeof approvalId === 'number' && Number.isInteger(approvalId) && approvalId > 0 ? approvalId : null;
}

export function readApprovalQueuedState(state: unknown): ApprovalQueuedNoticeState | null {
    if (!isRecord(state)) return null;
    const notice = state[APPROVAL_QUEUED_STATE_KEY];
    if (!isRecord(notice)) return null;
    const { approvalId } = notice;
    return {
        approvalId: typeof approvalId === 'number' && Number.isInteger(approvalId) && approvalId > 0
            ? approvalId
            : null,
    };
}

function withApprovalQueuedState(state: unknown, notice: ApprovalQueuedNoticeState): Record<string, unknown> {
    return { ...(isRecord(state) ? state : {}), [APPROVAL_QUEUED_STATE_KEY]: notice };
}

/** Router state without the approval-queued notice (`null` when nothing else remains). */
export function withoutApprovalQueuedState(state: unknown): Record<string, unknown> | null {
    if (!isRecord(state)) return null;
    const rest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(state)) {
        if (key !== APPROVAL_QUEUED_STATE_KEY) rest[key] = value;
    }
    return Object.keys(rest).length > 0 ? rest : null;
}

/**
 * Returns `announce(options)`: raises the success toast and shows the
 * persistent pending notice on the entity page (`to`, or the current page).
 */
export function useApprovalQueued(): (options?: AnnounceApprovalQueuedOptions) => void {
    const navigate = useNavigate();
    const location = useLocation();
    const feedback = useFeedback();
    const { t } = useTranslation('common');
    const { hash, pathname, search } = location;
    const state: unknown = location.state;

    return useCallback(({ approvalId = null, to }: AnnounceApprovalQueuedOptions = {}) => {
        feedback.success({
            title: t('approval.queued.toast_title'),
            description: t('approval.queued.toast_body'),
        });
        const notice: ApprovalQueuedNoticeState = { approvalId: approvalId ?? null };
        if (to === undefined) {
            void navigate(
                { pathname, search, hash },
                { replace: true, state: withApprovalQueuedState(state, notice) },
            );
            return;
        }
        void navigate(to, { state: withApprovalQueuedState(null, notice) });
    }, [feedback, hash, navigate, pathname, search, state, t]);
}
