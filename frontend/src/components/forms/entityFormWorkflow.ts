export interface EntityFormStepState {
    currentStep: number;
    maxStep?: number;
    minStep?: number;
}

export function nextEntityFormStep({ currentStep, maxStep = currentStep + 1 }: EntityFormStepState): number {
    return Math.min(currentStep + 1, maxStep);
}

export function previousEntityFormStep({ currentStep, minStep = 0 }: EntityFormStepState): number {
    return Math.max(currentStep - 1, minStep);
}
