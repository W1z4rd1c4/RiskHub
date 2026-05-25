import type { NavigateFunction } from 'react-router-dom';

import { KriFormFooter } from './KriFormFooter';
import type { KriFormStatePatch } from './useKriFormState';

interface KriFormNavigationProps {
    cancelLabel: string;
    currentStep: number;
    isEdit: boolean;
    isSubmitting: boolean;
    navigate: NavigateFunction;
    onCancel?: () => void;
    setStatePatch: (patch: KriFormStatePatch) => void;
    validateStep1: () => boolean;
}

export function KriFormNavigation({
    cancelLabel,
    currentStep,
    isEdit,
    isSubmitting,
    navigate,
    onCancel,
    setStatePatch,
    validateStep1,
}: KriFormNavigationProps) {
    return (
        <KriFormFooter
            cancelLabel={cancelLabel}
            currentStep={currentStep}
            isEdit={isEdit}
            isSubmitting={isSubmitting}
            onBack={() => {
                setStatePatch({ currentStep: 0, error: null });
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
                    setStatePatch({ currentStep: 1, error: null });
                }
            }}
        />
    );
}
