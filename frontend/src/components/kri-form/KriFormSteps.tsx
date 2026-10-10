import { FileText, Target } from 'lucide-react';

import { InlineMessage } from '@/components/ui/inline-message';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { WizardFooter } from '@/components/ui/WizardFooter';
import { translateUiMessage, useTranslation } from '@/i18n/hooks';

/** The KRI wizard's two steps (PG-11: the same step indicator and footer as the Risk and Control wizards). */
export const KRI_FORM_STEP_COUNT = 2;

export function KriFormStepIndicator({
    currentStep,
    isSubmitting,
    onStepClick,
}: {
    currentStep: number;
    isSubmitting: boolean;
    onStepClick: (index: number) => void;
}) {
    const { t } = useTranslation('kris');
    return (
        <StepIndicator
            steps={[
                { id: 'risk', title: t('kris:form.steps.risk'), icon: Target },
                { id: 'details', title: t('kris:form.steps.details'), icon: FileText },
            ]}
            currentStep={currentStep}
            isStepClickable={(index) => !isSubmitting && index < currentStep}
            onStepClick={onStepClick}
        />
    );
}

export function KriFormFooter({
    cancelLabel,
    currentStep,
    isEdit,
    isSubmitting,
    onBack,
    onCancel,
    onNext,
}: {
    cancelLabel: string;
    currentStep: number;
    isEdit: boolean;
    isSubmitting: boolean;
    onBack: () => void;
    onCancel: () => void;
    onNext: () => void;
}) {
    const { t } = useTranslation('kris');
    return (
        <WizardFooter
            className="mt-8 pt-8"
            stepIndex={currentStep}
            stepCount={KRI_FORM_STEP_COUNT}
            isSubmitting={isSubmitting}
            cancelLabel={cancelLabel}
            onCancel={onCancel}
            onBack={onBack}
            onNext={onNext}
            submitLabel={isEdit ? t('kris:edit_kri') : t('kris:create_kri')}
            nextTestId="kri-form-next-button"
            submitTestId="kri-form-submit-button"
        />
    );
}

/** The form-level error (risk selection, lookups, server); field errors sit on their fields. */
export function KriFormErrorBanner({ error }: { error: string }) {
    const { t } = useTranslation(['errorKeys', 'kris']);
    return (
        <InlineMessage tone="danger" className="mb-6">
            {translateUiMessage(t, error)}
        </InlineMessage>
    );
}
