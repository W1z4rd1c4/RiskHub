import { useId, type Dispatch, type ReactNode, type SetStateAction } from 'react';

import { Button } from '@/components/ui/button';
import { CardTitle } from '@/components/ui/card';
import type { RiskQuestionnaireClarification } from '@/types/riskQuestionnaire';

import type { RiskQuestionnaireSection } from '../riskQuestionnaireQuestions';
import { ClarificationRequestPanel } from './ClarificationRequestPanel';
import { ClarificationThread } from './ClarificationThread';
import { QuestionAnswerField } from './QuestionAnswerField';
import type { QuestionnaireOption, TranslateFn } from './questionnairePresentation';

interface AnswerState {
    answers: Record<string, unknown>;
    getPreviousAnswer: (key: string) => unknown;
    isChanged: (key: string) => boolean;
    isEditable: boolean;
    missingKeys: string[];
    setAnswers: Dispatch<SetStateAction<Record<string, unknown>>>;
}

interface ClarificationState {
    clarificationsLoading: boolean;
    handleRequestClarification: (sectionKey: string) => Promise<void>;
    handleRespondClarification: (clarificationId: number) => Promise<void>;
    requestMessage: string;
    requestQuestionKeys: string[];
    requestingClarification: boolean;
    requestingSectionKey: string | null;
    respondingClarificationId: number | null;
    respondingClarification: boolean;
    responseMessage: string;
    sectionClarifications: Map<string, RiskQuestionnaireClarification[]>;
    setRequestMessage: (value: string) => void;
    setRequestQuestionKeys: (value: string[]) => void;
    setRequestingSectionKey: (value: string | null) => void;
    setRespondingClarificationId: (value: number | null) => void;
    setResponseMessage: (value: string) => void;
}

interface QuestionOptions {
    likelihoodOptions: QuestionnaireOption[];
    likelihoodQuestionKey: string;
    worstCaseImpactOptions: QuestionnaireOption[];
    worstCaseImpactQuestionKey: string;
}

interface RiskQuestionnaireSectionListProps {
    answerState: AnswerState;
    canRequestClarification: boolean;
    clarificationState: ClarificationState;
    isRiskOwner: boolean;
    locale: string;
    questionnaireStatus?: string;
    questionOptions: QuestionOptions;
    renderAnswer: (key: string, value: unknown) => string | null;
    t: TranslateFn;
    template: RiskQuestionnaireSection[];
}

function AnswerGrid({ as: Component, children }: { as: 'div' | 'dl'; children: ReactNode }) {
    return <Component className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</Component>;
}

export function RiskQuestionnaireSectionList({
    answerState,
    canRequestClarification,
    clarificationState,
    isRiskOwner,
    locale,
    questionnaireStatus,
    questionOptions,
    renderAnswer,
    t,
    template,
}: RiskQuestionnaireSectionListProps) {
    const idPrefix = useId();
    return (
        <>
            {template.map((section) => {
                const headingId = `${idPrefix}-${section.titleKey.replace(/[^\w-]/g, '-')}`;
                return (
                    <section key={section.titleKey} className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <CardTitle as="h3" id={headingId}>
                                {t(`risks:${section.titleKey}`, section.titleKey)}
                            </CardTitle>
                            {canRequestClarification && questionnaireStatus === 'submitted' && (
                                <Button
                                    variant="outline"
                                    size="compact"
                                    aria-describedby={headingId}
                                    onClick={() => {
                                        clarificationState.setRequestingSectionKey(section.titleKey);
                                        clarificationState.setRequestMessage('');
                                        clarificationState.setRequestQuestionKeys([]);
                                    }}
                                >
                                    {t('risks:questionnaire.request_clarification')}
                                </Button>
                            )}
                        </div>

                        {clarificationState.requestingSectionKey === section.titleKey && (
                            <ClarificationRequestPanel
                                onCancel={() => clarificationState.setRequestingSectionKey(null)}
                                onQuestionKeysChange={clarificationState.setRequestQuestionKeys}
                                onRequestMessageChange={clarificationState.setRequestMessage}
                                onSubmit={() => void clarificationState.handleRequestClarification(section.titleKey)}
                                pending={clarificationState.requestingClarification}
                                questions={section.questions}
                                requestMessage={clarificationState.requestMessage}
                                requestQuestionKeys={clarificationState.requestQuestionKeys}
                                t={t}
                            />
                        )}

                        {!clarificationState.clarificationsLoading && (
                            <ClarificationThread
                                clarifications={clarificationState.sectionClarifications.get(section.titleKey) ?? []}
                                isRiskOwner={isRiskOwner}
                                locale={locale}
                                onCancelResponse={() => clarificationState.setRespondingClarificationId(null)}
                                onRespond={(clarificationId) => void clarificationState.handleRespondClarification(clarificationId)}
                                onResponseMessageChange={clarificationState.setResponseMessage}
                                onStartResponse={(clarificationId) => {
                                    clarificationState.setRespondingClarificationId(clarificationId);
                                    clarificationState.setResponseMessage('');
                                }}
                                respondingClarificationId={clarificationState.respondingClarificationId}
                                responding={clarificationState.respondingClarification}
                                responseMessage={clarificationState.responseMessage}
                                t={t}
                            />
                        )}

                        {/* Read-only answers are label/value pairs (`dl`); editable ones are form fields. */}
                        <AnswerGrid as={answerState.isEditable ? 'div' : 'dl'}>
                            {section.questions.map((question) => (
                                <QuestionAnswerField
                                    key={question.key}
                                    answers={answerState.answers}
                                    getPreviousAnswer={answerState.getPreviousAnswer}
                                    isChanged={answerState.isChanged}
                                    isEditable={answerState.isEditable}
                                    likelihoodOptions={questionOptions.likelihoodOptions}
                                    likelihoodQuestionKey={questionOptions.likelihoodQuestionKey}
                                    missingKeys={answerState.missingKeys}
                                    question={question}
                                    renderAnswer={renderAnswer}
                                    setAnswers={answerState.setAnswers}
                                    t={t}
                                    worstCaseImpactOptions={questionOptions.worstCaseImpactOptions}
                                    worstCaseImpactQuestionKey={questionOptions.worstCaseImpactQuestionKey}
                                />
                            ))}
                        </AnswerGrid>
                    </section>
                );
            })}
        </>
    );
}
