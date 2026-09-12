import type { RiskQuestionnaireDetail } from '@/types/riskQuestionnaire';
import { TableErrorState } from '@/components/tables/tableError/TableErrorState';

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
        <div className="p-6 border-b border-white/5 bg-white/[0.02]">
            <h4 className="text-[10px] font-black text-white uppercase tracking-widest mb-3">
                {t('risks:questionnaires.assessment_summary_title')}
            </h4>

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
                <div className="text-sm text-slate-400">{t('loading.generic')}</div>
            ) : !latestSubmitted ? (
                <div className="text-sm text-slate-400">
                    {t('risks:questionnaires.assessment_summary_empty')}
                </div>
            ) : (
                <div data-testid="risk-questionnaire-summary-content" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                            {t('risks:questionnaires.assessment_summary_submitted_at')}
                        </p>
                        <p className="text-sm text-white">{formatQuestionnaireDate(latestSubmitted.submitted_at, locale)}</p>
                    </div>

                    <div className="space-y-1">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                            {t('risks:questionnaires.assessment_summary_changed_count')}
                        </p>
                        <p className="text-sm text-white">
                            {changedCount === null ? '—' : `${changedCount}`}
                        </p>
                    </div>

                    <div className="space-y-1">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                            {t('risks:questionnaires.assessment_summary_likelihood')}
                        </p>
                        <p className="text-sm text-white">{latestLikelihood ?? '—'}</p>
                    </div>

                    <div className="space-y-1">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                            {t('risks:questionnaires.assessment_summary_worst_case_impact')}
                        </p>
                        <p className="text-sm text-white">
                            {latestWorstCaseImpact ? `${latestWorstCaseImpact}${worstCaseRange ? ` • ${worstCaseRange}` : ''}` : '—'}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
