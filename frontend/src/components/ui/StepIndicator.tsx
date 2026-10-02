import { CheckCircle2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface Step {
    id: string;
    title: string;
    icon: React.ComponentType<{ className?: string }>;
}

export interface StepIndicatorProps {
    steps: Step[];
    currentStep: number;
    isStepClickable: (index: number) => boolean;
    onStepClick: (index: number) => void;
}

/**
 * Reusable multi-step indicator component.
 * 
 * Props:
 * - steps: Array of step definitions with id, title, and icon
 * - currentStep: Zero-based index of the active step
 * - isStepClickable: Function to determine if a step can be clicked
 * - onStepClick: Callback when a step is clicked (only called if clickable)
 */
export function StepIndicator({
    steps,
    currentStep,
    isStepClickable,
    onStepClick,
}: StepIndicatorProps) {
    return (
        <div className="flex justify-between items-center px-4">
            {steps.map((step, idx) => {
                const isClickable = isStepClickable(idx);
                const isActive = currentStep === idx;
                const isCompleted = currentStep > idx;

                return (
                    <button
                        key={step.id}
                        type="button"
                        disabled={!isClickable}
                        aria-current={isActive ? 'step' : undefined}
                        className={cn(
                            // DS-29 / DS-31: shared focus ring; colour-only transition with the motion token.
                            'group flex flex-col items-center gap-2 rounded-lg transition-colors duration-base focus-ring',
                            isClickable ? 'cursor-pointer' : isActive ? 'cursor-default' : 'cursor-not-allowed opacity-50',
                        )}
                        onClick={() => onStepClick(idx)}
                    >
                        <div
                            className={cn(
                                'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors duration-base',
                                isActive
                                    ? 'bg-accent border-accent text-accent-foreground shadow-lg shadow-accent/25'
                                    : isCompleted
                                        ? 'bg-success border-success text-success-foreground'
                                        : 'bg-tint/5 border-border text-icon-muted',
                            )}
                        >
                            {isCompleted ? (
                                <CheckCircle2 className="h-5 w-5" />
                            ) : (
                                <step.icon className="h-5 w-5" />
                            )}
                        </div>
                        <span
                            className={`text-2xs font-bold uppercase tracking-widest ${isActive
                                    ? 'text-foreground'
                                    : isClickable
                                        ? 'text-muted-foreground group-hover:text-foreground'
                                        : 'text-muted-foreground'
                                }`}
                        >
                            {step.title}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
