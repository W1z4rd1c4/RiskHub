import { CheckCircle2 } from 'lucide-react';

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
                    <div
                        key={step.id}
                        className={`flex flex-col items-center gap-2 group transition-all ${isClickable
                                ? 'cursor-pointer'
                                : isActive
                                    ? 'cursor-default'
                                    : 'cursor-not-allowed opacity-50'
                            }`}
                        onClick={() => isClickable && onStepClick(idx)}
                    >
                        <div
                            className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${isActive
                                    ? 'bg-accent border-accent text-white shadow-lg shadow-accent/25'
                                    : isCompleted
                                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                                        : 'bg-white/5 border-white/10 text-slate-500'
                                }`}
                        >
                            {isCompleted ? (
                                <CheckCircle2 className="h-5 w-5" />
                            ) : (
                                <step.icon className="h-5 w-5" />
                            )}
                        </div>
                        <span
                            className={`text-[10px] font-black uppercase tracking-widest ${isActive
                                    ? 'text-white'
                                    : isClickable
                                        ? 'text-slate-400 group-hover:text-slate-200'
                                        : 'text-slate-500'
                                }`}
                        >
                            {step.title}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
