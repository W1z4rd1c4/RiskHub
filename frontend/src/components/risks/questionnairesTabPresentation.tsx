import { Badge } from '@/components/ui/badge';
import { formatFinancialRange } from '@/constants/riskScoreDescriptions';
import { formatDateValue } from '@/i18n/formatters';
import { getQuestionnaireStatusMeta } from '@/lib/questionnaireStatus';
import type { RiskQuestionnaireDetail, RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';

import { getRiskOwnerReassessmentQuestionKeys } from './riskQuestionnaireQuestions';
import { getChangedAnswerCount, normalizeForCompare, type TranslateFn } from './risk-questionnaire-detail/questionnairePresentation';

export function formatQuestionnaireDate(value: string | null | undefined, locale: string): string {
    if (!value) return '—';
    return formatDateValue(value, locale);
}

/** Status pill for a questionnaire, from the single status map (PG-20). */
export function questionnaireStatusBadge(questionnaire: RiskQuestionnaireListItem, t: TranslateFn) {
    const meta = getQuestionnaireStatusMeta(questionnaire);
    return (
        <Badge tone={meta.tone} size="sm">
            {meta.labelKey ? t(meta.labelKey) : questionnaire.status}
        </Badge>
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
