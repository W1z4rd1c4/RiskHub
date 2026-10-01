import { useId, useMemo } from 'react';

import { useTranslation } from '@/i18n/hooks';
import { DialogBody, DialogShell } from '@/components/ui/dialog';
import { InlineMessage } from '@/components/ui/inline-message';
import { useTotalAssetsValue } from '@/hooks/useRiskHubConfig';
import type { Risk } from '@/types/risk';

import {
    buildLikelihoodOptions,
    buildWorstCaseImpactOptions,
    formatQuestionnaireAnswer,
    LIKELIHOOD_12M_KEY,
    WORST_CASE_IMPACT_KEY,
} from './questionnairePresentation';
import { RiskQuestionnaireActions } from './RiskQuestionnaireActions';
import { RiskQuestionnaireCompareNotice } from './RiskQuestionnaireCompareNotice';
import { RiskQuestionnaireDetailHeader } from './RiskQuestionnaireDetailHeader';
import { RiskQuestionnaireSectionList } from './RiskQuestionnaireSectionList';
import { useRiskQuestionnaireDetailWorkflow } from './useRiskQuestionnaireDetailWorkflow';

interface RiskQuestionnaireDetailProps {
    isOpen: boolean;
    onClose: () => void;
    questionnaireId: number | null;
    risk: Risk;
    onChanged?: () => void;
}

export function RiskQuestionnaireDetail({
    isOpen,
    onClose,
    questionnaireId,
    risk,
    onChanged,
}: RiskQuestionnaireDetailProps) {
    const { t, i18n } = useTranslation(['common', 'risks']);
    const titleId = useId();
    const { totalAssets } = useTotalAssetsValue();
    const workflow = useRiskQuestionnaireDetailWorkflow({
        isOpen,
        onChanged,
        onClose,
        questionnaireId,
        risk,
    });
    const likelihoodOptions = useMemo(() => buildLikelihoodOptions(t), [t]);
    const worstCaseImpactOptions = useMemo(
        () => buildWorstCaseImpactOptions(totalAssets, t),
        [t, totalAssets],
    );
    const renderAnswer = (key: string, value: unknown): string => formatQuestionnaireAnswer(
        key,
        value,
        { totalAssets, t },
    );

    return (
        <DialogShell
            isOpen={isOpen && Boolean(questionnaireId)}
            onClose={workflow.close}
            titleId={titleId}
            isBusy={workflow.saving || workflow.submitting}
            size="xl"
            className="max-w-3xl"
        >
            <RiskQuestionnaireDetailHeader
                compareMode={workflow.compareState.compareMode}
                isOverdue={workflow.isOverdue}
                locale={i18n.language}
                onClose={workflow.close}
                questionnaire={workflow.questionnaire}
                setCompareMode={workflow.compareState.setCompareMode}
                t={t}
            />

            <DialogBody>
                {workflow.loading ? (
                    <div className="text-muted-foreground">{t('loading.generic')}</div>
                ) : (
                    <div className="space-y-6">
                        {workflow.errorKey ? (
                            <InlineMessage tone="danger">
                                {workflow.errorKey.startsWith('errorKeys.')
                                    ? t(workflow.errorKey.replace('errorKeys.', ''), { ns: 'errorKeys' })
                                    : t(workflow.errorKey)}
                            </InlineMessage>
                        ) : null}

                        {workflow.questionnaire ? (
                            <div data-testid="risk-questionnaire-ready" className="space-y-6">
                                <RiskQuestionnaireCompareNotice
                                    compareMode={workflow.compareState.compareMode}
                                    hasPreviousCycle={workflow.compareState.hasPreviousCycle}
                                    previousCycleLoaded={workflow.compareState.previousCycleLoaded}
                                    t={t}
                                />

                                <RiskQuestionnaireSectionList
                                    answerState={workflow.answerState}
                                    canRequestClarification={workflow.capabilities.canRequestClarification}
                                    clarificationState={workflow.clarificationState}
                                    isRiskOwner={workflow.capabilities.isRiskOwner}
                                    locale={i18n.language}
                                    questionnaireStatus={workflow.questionnaire.status}
                                    questionOptions={{
                                        likelihoodOptions,
                                        likelihoodQuestionKey: LIKELIHOOD_12M_KEY,
                                        worstCaseImpactOptions,
                                        worstCaseImpactQuestionKey: WORST_CASE_IMPACT_KEY,
                                    }}
                                    renderAnswer={renderAnswer}
                                    t={t}
                                    template={workflow.template}
                                />
                            </div>
                        ) : null}
                    </div>
                )}
            </DialogBody>

            <RiskQuestionnaireActions
                canSaveDraft={workflow.capabilities.canSaveDraft}
                canSubmitQuestionnaire={workflow.capabilities.canSubmitQuestionnaire}
                isEditable={workflow.capabilities.isEditable}
                onClose={workflow.close}
                onSave={workflow.handleSave}
                onSubmit={workflow.handleSubmit}
                saving={workflow.saving}
                submitting={workflow.submitting}
                t={t}
            />
        </DialogShell>
    );
}
