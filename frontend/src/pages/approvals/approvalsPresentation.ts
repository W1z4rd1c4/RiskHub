import type { SafeTFunction } from '@/i18n/hooks';
import type { ApprovalActionType, ApprovalStatus } from '@/types/approval';
import type { RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';

export function getApprovalStatusBadge(status: ApprovalStatus): string {
    switch (status) {
        case 'pending':
            return 'text-warning-text border-warning/20 bg-warning/10';
        case 'pending_privileged':
            return 'text-accent-text border-accent/20 bg-accent/10';
        case 'approved':
            return 'text-success-text border-success/20 bg-success/10';
        case 'rejected':
            return 'text-destructive border-destructive/20 bg-destructive/10';
        case 'expired':
            return 'text-slate-400 border-slate-400/20 bg-slate-400/5';
        case 'cancelled':
        default:
            return 'text-slate-400 border-slate-400/20 bg-slate-400/5';
    }
}

export function getApprovalActionBadge(action: ApprovalActionType): string {
    switch (action) {
        case 'delete':
        case 'archive':
            return 'text-destructive bg-destructive/10 border-destructive/20';
        case 'create':
            return 'text-success-text bg-success/10 border-success/20';
        case 'edit':
            return 'text-accent-text bg-info/10 border-info/20';
        default:
            return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
    }
}

export type GovernedActionLabel = 'create' | 'update' | 'archive' | 'link_add' | 'link_update' | 'link_remove';

export function getGovernedActionLabel(
    actionType: ApprovalActionType,
    mutationKind?: string | null,
): GovernedActionLabel {
    if (mutationKind?.startsWith('vendor.link.') || mutationKind?.startsWith('asset.link.')) {
        if (mutationKind.endsWith('.add')) return 'link_add';
        if (mutationKind.endsWith('.remove')) return 'link_remove';
    }
    if (
        mutationKind === 'vendor.create'
        || mutationKind === 'vendor.contract.create'
        || mutationKind === 'vendor.sub_outsourcing.create'
    ) return 'create';
    if (
        mutationKind === 'vendor.archive'
        || mutationKind === 'vendor.contract.archive'
        || mutationKind === 'vendor.sub_outsourcing.archive'
    ) return 'archive';
    switch (mutationKind) {
        case 'process.create':
            return 'create';
        case 'process.archive':
            return 'archive';
        case 'process.link.risk.add':
        case 'process.link.asset.add':
        case 'process.link.vendor.add':
            return 'link_add';
        case 'process.link.asset.update':
            return 'link_update';
        case 'process.link.risk.remove':
        case 'process.link.asset.remove':
        case 'process.link.vendor.remove':
            return 'link_remove';
        case null:
        case undefined:
            break;
    }
    if (actionType === 'create') return 'create';
    if (actionType === 'archive' || actionType === 'delete') return 'archive';
    return 'update';
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
