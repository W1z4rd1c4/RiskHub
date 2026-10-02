import * as React from 'react';
import { ChevronLeft, ChevronRight, Save, X } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

import { Button } from './button';

/**
 * Footer of a multi-step form (audit §4.8 "Wizard footer", DS-10): Cancel on
 * the first step and Back on later steps on the left (`secondary`), Next or the
 * submit on the right (`accent`, the submit is `type="submit"` so Enter in the
 * form submits it). The Risk, Control and KRI wizards share it.
 *
 * While `isSubmitting`, the actions stay focusable but inert (`aria-disabled`)
 * so the pressed submit keeps keyboard focus, and the submit is `aria-busy`
 * with the translated "Loading…" label.
 */
export interface WizardFooterProps {
    /** Zero-based index of the current step. */
    stepIndex: number;
    stepCount: number;
    isSubmitting?: boolean;
    /** First-step escape (leave the form). */
    onCancel: () => void;
    /** Later steps: go to the previous step. */
    onBack: () => void;
    /** Not-last steps: validate and advance. */
    onNext: (event: React.MouseEvent<HTMLButtonElement>) => void;
    submitLabel: string;
    /** Defaults to `common:actions.cancel`; name the destination when it is a page (D14). */
    cancelLabel?: string;
    cancelTestId?: string;
    backTestId?: string;
    nextTestId?: string;
    submitTestId?: string;
    className?: string;
}

export function WizardFooter({
    stepIndex,
    stepCount,
    isSubmitting = false,
    onCancel,
    onBack,
    onNext,
    submitLabel,
    cancelLabel,
    cancelTestId,
    backTestId,
    nextTestId,
    submitTestId,
    className,
}: WizardFooterProps) {
    const { t } = useTranslation('common');
    const isFirstStep = stepIndex === 0;
    const isLastStep = stepIndex >= stepCount - 1;
    const inert = isSubmitting || undefined;

    return (
        <div className={cn('flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6', className)}>
            {isFirstStep ? (
                <Button
                    variant="secondary"
                    aria-disabled={inert}
                    data-testid={cancelTestId}
                    onClick={() => {
                        if (!isSubmitting) onCancel();
                    }}
                >
                    <X aria-hidden="true" />
                    {cancelLabel ?? t('actions.cancel')}
                </Button>
            ) : (
                <Button
                    variant="secondary"
                    aria-disabled={inert}
                    data-testid={backTestId}
                    onClick={() => {
                        if (!isSubmitting) onBack();
                    }}
                >
                    <ChevronLeft aria-hidden="true" />
                    {t('actions.back')}
                </Button>
            )}

            {isLastStep ? (
                <Button
                    key="submit"
                    type="submit"
                    variant="accent"
                    aria-disabled={inert}
                    aria-busy={inert}
                    data-testid={submitTestId}
                    onClick={(event) => {
                        if (isSubmitting) event.preventDefault();
                    }}
                >
                    {isSubmitting ? t('loading.generic') : submitLabel}
                    <Save aria-hidden="true" />
                </Button>
            ) : (
                <Button
                    key="next"
                    variant="accent"
                    aria-disabled={inert}
                    data-testid={nextTestId}
                    onClick={(event) => {
                        if (!isSubmitting) onNext(event);
                    }}
                >
                    {t('actions.next')}
                    <ChevronRight aria-hidden="true" />
                </Button>
            )}
        </div>
    );
}
WizardFooter.displayName = 'WizardFooter';
