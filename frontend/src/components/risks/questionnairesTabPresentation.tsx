import { formatFinancialRange } from '@/constants/riskScoreDescriptions';
import { formatDateValue } from '@/i18n/formatters';
import type { RiskQuestionnaireDetail, RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';

import { getRiskOwnerReassessmentQuestionKeys } from './riskQuestionnaireQuestions';
import { getChangedAnswerCount, normalizeForCompare, type TranslateFn } from './risk-questionnaire-detail/questionnairePresentation';

export function formatQuestionnaireDate(value: string | null | undefined, locale: string): string {
    if (!value) return '—';
    return formatDateValue(value, locale);
}

export function isQuestionnaireOverdue(item: RiskQuestionnaireListItem): boolean {
    if (item.status === 'submitted') return false;
    return new Date(item.due_at).getTime() < Date.now();
}

export function questionnaireStatusBadge(status: string, overdue: boolean, t: TranslateFn) {
    if (overdue) {
        return (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-rose-500/10 border-rose-500/20 text-rose-400">
                {t('risks:questionnaire.status.overdue')}
            </span>
        );
    }
    if (status === 'sent') {
        return (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-amber-500/10 border-amber-500/20 text-amber-400">
                {t('risks:questionnaire.status.sent')}
            </span>
        );
    }
    if (status === 'in_progress') {
        return (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-accent/10 border-accent/20 text-accent">
                {t('risks:questionnaire.status.in_progress')}
            </span>
        );
    }
    if (status === 'submitted') {
        return (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                {t('risks:questionnaire.status.submitted')}
            </span>
        );
    }
    return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-white/5 border-white/10 text-slate-300">
            {status}
        </span>
    );
}

export function getLatestQuestionnaireChangedCount(latestSubmitted: RiskQuestionnaireDetail | null): number | null {
    if (!latestSubmitted?.previous_submission?.answers) return null;
    const current = (latestSubmitted.answers ?? {}) as Record<string, unknown>;
    const previous = (latestSubmitted.previous_submission.answers ?? {}) as Record<string, unknown>;
    const keys = getRiskOwnerReassessmentQuestionKeys(latestSubmitted.template_version);
    return getChangedAnswerCount(keys, current, previous);
}

export function getLatestQuestionnaireMetrics(
    latestSubmitted: RiskQuestionnaireDetail | null,
    options: {
        totalAssets: number;
        t: TranslateFn;
    },
) {
    const { totalAssets, t } = options;
    const latestLikelihood = normalizeForCompare(latestSubmitted?.answers?.['risk_assessment.q11_likelihood_12m']) as number | null;
    const latestWorstCaseImpact = normalizeForCompare(latestSubmitted?.answers?.['risk_assessment.q12_worst_case_impact']) as number | null;
    const worstCaseRange = latestWorstCaseImpact
        ? formatFinancialRange(latestWorstCaseImpact, totalAssets, t('risks:form.financial.no_loss'))
        : '';

    return {
        latestLikelihood,
        latestWorstCaseImpact,
        worstCaseRange,
    };
}
