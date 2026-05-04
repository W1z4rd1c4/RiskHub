export interface EntityFormStepState {
    currentStep: number;
    maxStep?: number;
    minStep?: number;
}

export interface EntityFormSubmitOutcomeInput {
    approvalQueued?: boolean;
}

export function nextEntityFormStep({ currentStep, maxStep = currentStep + 1 }: EntityFormStepState): number {
    return Math.min(currentStep + 1, maxStep);
}

export function previousEntityFormStep({ currentStep, minStep = 1 }: EntityFormStepState): number {
    return Math.max(currentStep - 1, minStep);
}

export function resolveSubmitOutcome({ approvalQueued = false }: EntityFormSubmitOutcomeInput) {
    return {
        shouldClose: !approvalQueued,
        shouldRefresh: true,
        approvalQueued,
    };
}
