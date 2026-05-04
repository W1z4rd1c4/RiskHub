export type QuestionnaireDetailTransitionKind =
    | 'read'
    | 'open'
    | 'save'
    | 'submit'
    | 'request_clarification'
    | 'respond_clarification';

export interface QuestionnaireDetailTransitionInput {
    kind: QuestionnaireDetailTransitionKind;
    shouldAutoOpen: boolean;
}

export function resolveQuestionnaireDetailTransition({
    kind,
    shouldAutoOpen,
}: QuestionnaireDetailTransitionInput) {
    return {
        shouldOpen: kind === 'open' || shouldAutoOpen,
        shouldRefresh: kind !== 'read',
    };
}

export function buildQuestionnaireComparisonModel({
    currentAnswerCount,
    previousAnswerCount,
}: {
    currentAnswerCount: number;
    previousAnswerCount: number;
}) {
    return {
        currentAnswerCount,
        previousAnswerCount,
        hasPreviousSubmission: previousAnswerCount > 0,
    };
}
