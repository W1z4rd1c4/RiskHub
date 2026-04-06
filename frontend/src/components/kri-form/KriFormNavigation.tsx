import type { NavigateFunction } from 'react-router-dom';

import { KriFormFooter } from './KriFormFooter';

interface KriFormNavigationProps {
    cancelLabel: string;
    currentStep: number;
    isEdit: boolean;
    isSubmitting: boolean;
    navigate: NavigateFunction;
    onCancel?: () => void;
    setCurrentStep: (currentStep: number) => void;
    setError: (error: string | null) => void;
    validateStep1: () => boolean;
}

export function KriFormNavigation({
    cancelLabel,
    currentStep,
    isEdit,
    isSubmitting,
    navigate,
    onCancel,
    setCurrentStep,
    setError,
    validateStep1,
}: KriFormNavigationProps) {
    return (
        <KriFormFooter
            cancelLabel={cancelLabel}
            currentStep={currentStep}
            isEdit={isEdit}
            isSubmitting={isSubmitting}
            onBack={() => {
                setError(null);
                setCurrentStep(0);
            }}
            onCancel={() => {
                if (onCancel) {
                    onCancel();
                    return;
                }
                void navigate('/kris');
            }}
            onNext={() => {
                if (validateStep1()) {
                    setError(null);
                    setCurrentStep(1);
                }
            }}
        />
    );
}
