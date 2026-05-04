export interface EntityFormStepState {
    currentStep: number;
    maxStep?: number;
}

export interface EntityFormSubmitOutcomeInput {
    approvalQueued?: boolean;
}

export function nextEntityFormStep({ currentStep, maxStep = currentStep + 1 }: EntityFormStepState): number {
    return Math.min(currentStep + 1, maxStep);
}

export function previousEntityFormStep({ currentStep }: EntityFormStepState): number {
    return Math.max(currentStep - 1, 1);
}

export function resolveSubmitOutcome({ approvalQueued = false }: EntityFormSubmitOutcomeInput) {
    return {
        shouldClose: !approvalQueued,
        shouldRefresh: true,
        approvalQueued,
    };
}
