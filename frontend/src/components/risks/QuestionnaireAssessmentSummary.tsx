import type { RiskQuestionnaireDetail } from '@/types/riskQuestionnaire';
import { TableErrorState } from '@/components/tables/tableError/TableErrorState';
import { CardTitle } from '@/components/ui/card';
import { EmptyState, LoadingState } from '@/components/ui/state';

import type { TranslateFn } from './risk-questionnaire-detail/questionnairePresentation';
import type { LatestSubmittedLoadOutcome } from './useRiskQuestionnairesTabData';
import {
    formatQuestionnaireDate,
    getLatestQuestionnaireChangedCount,
    getLatestQuestionnaireMetrics,
} from './questionnairesTabPresentation';

interface QuestionnaireAssessmentSummaryProps {
    latestSubmitted: RiskQuestionnaireDetail | null;
    latestSubmittedLoading: boolean;
    loadOutcome: LatestSubmittedLoadOutcome;
    locale: string;
    onRetry: () => void;
    t: TranslateFn;
    totalAssets: number;
}

export function QuestionnaireAssessmentSummary({
    latestSubmitted,
    latestSubmittedLoading,
    loadOutcome,
    locale,
    onRetry,
    t,
    totalAssets,
}: QuestionnaireAssessmentSummaryProps) {
    const changedCount = getLatestQuestionnaireChangedCount(latestSubmitted);
    const {
        latestLikelihood,
        latestWorstCaseImpact,
        worstCaseRange,
    } = getLatestQuestionnaireMetrics(latestSubmitted, { totalAssets, t });

    return (
        <div className="p-6 border-b border-border bg-tint/[0.03]">
            <CardTitle as="h3" className="mb-3">
                {t('risks:questionnaires.assessment_summary_title')}
            </CardTitle>

            {loadOutcome === 'stale-with-error' ? (
                <TableErrorState
                    variant="banner"
                    testId="risk-questionnaire-summary-load-state"
                    message={t('common:detail_load.stale_description')}
                    onRetry={onRetry}
                    isRetrying={latestSubmittedLoading}
                    className="mb-4"
                />
            ) : null}

            {loadOutcome === 'fatal-error' || loadOutcome === 'denied' ? (
                <TableErrorState
                    testId="risk-questionnaire-summary-load-state"
                    message={t('common:errors.load_failed')}
                    onRetry={loadOutcome === 'fatal-error' ? onRetry : undefined}
                    isRetrying={latestSubmittedLoading}
                />
            ) : latestSubmittedLoading && !latestSubmitted ? (
                <LoadingState layout="inline" label={t('loading.generic')} />
            ) : !latestSubmitted ? (
                <EmptyState layout="inline" icon={null} title={t('risks:questionnaires.assessment_summary_empty')} />
            ) : (
                <dl data-testid="risk-questionnaire-summary-content" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <dt className="text-eyebrow">{t('risks:questionnaires.assessment_summary_submitted_at')}</dt>
                        <dd className="text-sm text-foreground">{formatQuestionnaireDate(latestSubmitted.submitted_at, locale)}</dd>
                    </div>

                    <div className="space-y-1">
                        <dt className="text-eyebrow">{t('risks:questionnaires.assessment_summary_changed_count')}</dt>
                        <dd className="text-sm text-foreground">
                            {changedCount === null ? '—' : `${changedCount}`}
                        </dd>
                    </div>

                    <div className="space-y-1">
                        <dt className="text-eyebrow">{t('risks:questionnaires.assessment_summary_likelihood')}</dt>
                        <dd className="text-sm text-foreground">{latestLikelihood ?? '—'}</dd>
                    </div>

                    <div className="space-y-1">
                        <dt className="text-eyebrow">{t('risks:questionnaires.assessment_summary_worst_case_impact')}</dt>
                        <dd className="text-sm text-foreground">
                            {latestWorstCaseImpact ? `${latestWorstCaseImpact}${worstCaseRange ? ` • ${worstCaseRange}` : ''}` : '—'}
                        </dd>
                    </div>
                </dl>
            )}
        </div>
    );
}
