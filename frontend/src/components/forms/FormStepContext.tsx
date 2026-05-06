import { createContext, useCallback, useContext, type Dispatch, type ReactNode, type SetStateAction } from 'react';

import { nextEntityFormStep, previousEntityFormStep } from './entityFormWorkflow';

interface FormStepProviderProps<TValue> {
    children: ReactNode;
    value: TValue;
}

export function createFormStepContext<TValue>(name: string) {
    const Context = createContext<TValue | undefined>(undefined);

    function Provider({ children, value }: FormStepProviderProps<TValue>) {
        return (
            <Context.Provider value={value}>
                {children}
            </Context.Provider>
        );
    }

    function useValue(): TValue {
        const value = useContext(Context);
        if (value === undefined) {
            throw new Error(`use${name} must be used within ${name}Provider`);
        }
        return value;
    }

    return { Provider, useValue };
}

interface UseFormStepNavigationOptions {
    currentStep: number;
    isEdit: boolean;
    maxStep: number;
    minStep?: number;
    setCurrentStep: Dispatch<SetStateAction<number>>;
    setError: (error: string | null) => void;
    validateStep: (step: number) => boolean;
}

export function useFormStepNavigation({
    currentStep,
    isEdit,
    maxStep,
    minStep = 0,
    setCurrentStep,
    setError,
    validateStep,
}: UseFormStepNavigationOptions) {
    const nextStep = useCallback(() => {
        setError(null);
        if (!validateStep(currentStep)) return;

        setCurrentStep((prev) => nextEntityFormStep({ currentStep: prev, maxStep }));
    }, [currentStep, maxStep, setCurrentStep, setError, validateStep]);

    const prevStep = useCallback(() => {
        setError(null);
        setCurrentStep((prev) => previousEntityFormStep({ currentStep: prev, minStep }));
    }, [minStep, setCurrentStep, setError]);

    const handleStepClick = useCallback((index: number) => {
        if (isEdit || index < currentStep) {
            setError(null);
            setCurrentStep(index);
            return;
        }

        if (index === currentStep + 1) {
            nextStep();
        }
    }, [currentStep, isEdit, nextStep, setCurrentStep, setError]);

    return { handleStepClick, nextStep, prevStep };
}
