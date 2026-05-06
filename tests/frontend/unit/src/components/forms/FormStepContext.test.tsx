import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createFormStepContext, useFormStepNavigation } from '@/components/forms/FormStepContext';

const testFormStepContext = createFormStepContext<{ label: string }>('TestFormStep');
const TestFormStepProvider = testFormStepContext.Provider;
const useTestFormStep = testFormStepContext.useValue;

function StepConsumer() {
    const value = useTestFormStep();
    return <span>{value.label}</span>;
}

describe('FormStepContext', () => {
    it('provides typed step state to nested step components', () => {
        render(
            <TestFormStepProvider value={{ label: 'Linked risk' }}>
                <StepConsumer />
            </TestFormStepProvider>
        );

        expect(screen.getByText('Linked risk')).toBeInTheDocument();
    });

    it('fails fast when a step component is rendered without a provider', () => {
        expect(() => render(<StepConsumer />)).toThrow('useTestFormStep must be used within TestFormStepProvider');
    });

    it('validates before moving to the next step', () => {
        const validateStep = vi.fn(() => false);
        render(<NavigationHarness validateStep={validateStep} />);

        fireEvent.click(screen.getByRole('button', { name: 'next' }));

        expect(validateStep).toHaveBeenCalledWith(0);
        expect(screen.getByText('step:0')).toBeInTheDocument();
    });

    it('clears errors and moves back on previous step', () => {
        render(<NavigationHarness initialStep={1} />);

        fireEvent.click(screen.getByRole('button', { name: 'prev' }));

        expect(screen.getByText('step:0')).toBeInTheDocument();
        expect(screen.getByText('error:null')).toBeInTheDocument();
    });

    it('allows direct step clicks in edit mode', () => {
        render(<NavigationHarness isEdit />);

        fireEvent.click(screen.getByRole('button', { name: 'click-step-3' }));

        expect(screen.getByText('step:3')).toBeInTheDocument();
    });

    it('prevents jumping multiple steps in create mode', () => {
        render(<NavigationHarness />);

        fireEvent.click(screen.getByRole('button', { name: 'click-step-3' }));

        expect(screen.getByText('step:0')).toBeInTheDocument();
    });
});

function NavigationHarness({
    initialStep = 0,
    isEdit = false,
    validateStep = () => true,
}: {
    initialStep?: number;
    isEdit?: boolean;
    validateStep?: (step: number) => boolean;
}) {
    const [currentStep, setCurrentStep] = useState(initialStep);
    const [error, setError] = useState<string | null>('existing error');
    const { handleStepClick, nextStep, prevStep } = useFormStepNavigation({
        currentStep,
        isEdit,
        maxStep: 3,
        setCurrentStep,
        setError,
        validateStep,
    });

    return (
        <div>
            <span>step:{currentStep}</span>
            <span>error:{String(error)}</span>
            <button type="button" onClick={nextStep}>next</button>
            <button type="button" onClick={prevStep}>prev</button>
            <button type="button" onClick={() => handleStepClick(3)}>click-step-3</button>
        </div>
    );
}
