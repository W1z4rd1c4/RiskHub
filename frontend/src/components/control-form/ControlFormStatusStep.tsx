import type { Control, ControlStatus as ControlStatusValue } from '@/types/control';
import { ControlStatus } from '@/types/control';
import { Field } from '@/components/ui/field';
import { RadioGroup } from '@/components/ui/radio-group';
import { CONTROL_STATUS_LABEL_KEYS } from '@/pages/controls/controlsPagePresentation';

interface ControlFormStatusStepProps {
    formData: Partial<Control>;
    handleInputChange: (field: keyof Control, value: unknown) => void;
    t: (key: string, options?: Record<string, unknown>) => string;
}

export function ControlFormStatusStep({ formData, handleInputChange, t }: ControlFormStatusStepProps) {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <Field label={t('controls:form.labels.inherent_risk_level')}>
                {(field) => (
                    <div className="flex items-center gap-4">
                        <input
                            {...field}
                            type="range"
                            min="1"
                            max="5"
                            step="1"
                            value={formData.risk_level}
                            onChange={(event) => handleInputChange('risk_level', parseInt(event.target.value))}
                            className="flex-1 accent-accent"
                        />
                        <span
                            aria-hidden="true"
                            className="w-12 h-12 rounded-xl bg-accent text-accent-foreground flex items-center justify-center font-bold text-xl tabular-nums shadow-lg shadow-accent/25"
                        >
                            {formData.risk_level}
                        </span>
                    </div>
                )}
            </Field>
            {/* GAP-D-01: translated status labels in a real radio group (one choice). */}
            <Field label={t('controls:form.labels.initial_status')} group>
                {(field) => (
                    <RadioGroup<ControlStatusValue>
                        {...field}
                        variant="card"
                        className="grid grid-cols-2 gap-4 space-y-0"
                        value={formData.status ?? ControlStatus.DRAFT}
                        onValueChange={(status) => handleInputChange('status', status)}
                        options={[ControlStatus.DRAFT, ControlStatus.ACTIVE].map((status) => ({
                            value: status,
                            label: t(CONTROL_STATUS_LABEL_KEYS[status]),
                            testId: `control-form-status-${status}`,
                        }))}
                    />
                )}
            </Field>
        </div>
    );
}
