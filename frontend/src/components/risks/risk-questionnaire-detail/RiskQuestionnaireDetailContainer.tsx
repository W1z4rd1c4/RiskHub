import { type ReactNode, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
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

    const portalContent: ReactNode = (
        <AnimatePresence>
            {isOpen && questionnaireId && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="fixed inset-0 backdrop-blur-sm z-[100] bg-black/40"
                        onClick={workflow.close}
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.98, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98, y: 10 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="fixed inset-0 z-[101] p-4 flex items-center justify-center"
                    >
                        <div className="w-full max-w-3xl glass-card !p-0 overflow-hidden shadow-2xl">
                            <RiskQuestionnaireDetailHeader
                                compareMode={workflow.compareState.compareMode}
                                isOverdue={workflow.isOverdue}
                                locale={i18n.language}
                                onClose={workflow.close}
                                questionnaire={workflow.questionnaire}
                                setCompareMode={workflow.compareState.setCompareMode}
                                t={t}
                            />

                            <div className="p-6 max-h-[70vh] overflow-y-auto">
                                {workflow.loading ? (
                                    <div className="text-slate-400">{t('loading.generic')}</div>
                                ) : workflow.errorKey ? (
                                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-start gap-2">
                                        <AlertCircle className="h-4 w-4 mt-0.5" />
                                        <div className="flex-1">
                                            <p className="font-medium">
                                                {workflow.errorKey.startsWith('errorKeys.')
                                                    ? t(workflow.errorKey.replace('errorKeys.', ''), { ns: 'errorKeys' })
                                                    : t(workflow.errorKey)}
                                            </p>
                                            {workflow.answerState.missingKeys.length > 0 && (
                                                <ul className="mt-2 list-disc list-inside text-xs text-rose-300/80">
                                                    {workflow.answerState.missingKeys.map((key) => (
                                                        <li key={key}>{t(`risks:questionnaire.questions.${key}`, key)}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                ) : workflow.questionnaire ? (
                                    <div className="space-y-6">
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
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );

    return createPortal(portalContent, document.body);
}
