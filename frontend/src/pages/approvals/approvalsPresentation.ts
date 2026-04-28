import type { SafeTFunction } from '@/i18n/hooks';
import type { ApprovalActionType, ApprovalStatus } from '@/types/approval';
import type { RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';

export type ApprovalsFilter = 'pending' | 'all' | 'mine' | 'risk_assessment';

export interface ApprovalListParams {
    limit: number;
    status?: 'pending';
    my_requests?: boolean;
}

export const APPROVAL_TABS: ReadonlyArray<{ value: ApprovalsFilter; labelKey: string }> = [
    { value: 'pending', labelKey: 'tabs.pending' },
    { value: 'mine', labelKey: 'tabs.mine' },
    { value: 'risk_assessment', labelKey: 'tabs.risk_assessment' },
    { value: 'all', labelKey: 'tabs.history' },
];

export function buildApprovalListParams(filter: ApprovalsFilter): ApprovalListParams {
    const params: ApprovalListParams = { limit: 100 };

    if (filter === 'pending') {
        params.status = 'pending';
    } else if (filter === 'mine') {
        params.my_requests = true;
    }

    return params;
}

export function getApprovalStatusBadge(status: ApprovalStatus): string {
    switch (status) {
        case 'pending':
            return 'text-amber-400 border-amber-400/20 bg-amber-400/5';
        case 'pending_privileged':
            return 'text-violet-400 border-violet-400/20 bg-violet-400/5';
        case 'approved':
            return 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5';
        case 'rejected':
            return 'text-rose-400 border-rose-400/20 bg-rose-400/5';
        case 'cancelled':
        default:
            return 'text-slate-400 border-slate-400/20 bg-slate-400/5';
    }
}

export function getApprovalActionBadge(action: ApprovalActionType): string {
    switch (action) {
        case 'delete':
            return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
        case 'edit':
            return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
        default:
            return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
    }
}

export function isQuestionnaireOverdue(questionnaire: RiskQuestionnaireListItem, now = Date.now()): boolean {
    return questionnaire.status !== 'submitted' && new Date(questionnaire.due_at).getTime() < now;
}

export function getQuestionnaireStatusBadge(questionnaire: RiskQuestionnaireListItem, now = Date.now()): string {
    if (isQuestionnaireOverdue(questionnaire, now)) {
        return 'text-rose-400 border-rose-400/20 bg-rose-400/5';
    }
    if (questionnaire.status === 'sent') {
        return 'text-amber-400 border-amber-400/20 bg-amber-400/5';
    }
    if (questionnaire.status === 'in_progress') {
        return 'text-accent border-accent/20 bg-accent/5';
    }
    return 'text-slate-400 border-slate-400/20 bg-slate-400/5';
}

export function getQuestionnaireStatusLabel(
    questionnaire: RiskQuestionnaireListItem,
    t: SafeTFunction,
    now = Date.now(),
): string {
    if (isQuestionnaireOverdue(questionnaire, now)) {
        return t('risks:questionnaire.status.overdue');
    }
    if (questionnaire.status === 'sent') {
        return t('risks:questionnaire.status.sent');
    }
    if (questionnaire.status === 'in_progress') {
        return t('risks:questionnaire.status.in_progress');
    }
    if (questionnaire.status === 'submitted') {
        return t('risks:questionnaire.status.submitted');
    }
    return questionnaire.status;
}
