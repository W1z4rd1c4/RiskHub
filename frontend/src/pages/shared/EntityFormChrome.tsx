import type { ReactNode } from 'react';
import { Save, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { InlineMessage } from '@/components/ui/inline-message';
import { cn } from '@/lib/utils';

/**
 * Chrome shared by the register entity forms (Asset, Process, Threat; audit
 * 2026-09-30 §4.8, DS-10, AX-04, AX-05): section cards, the form-top error and
 * load-failure messages, and the cancel / submit footer. Fields themselves use
 * `Field` + the `components/ui` controls in each form.
 */
export function FormSection({
    title,
    description,
    children,
    className,
}: {
    title: ReactNode;
    description?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <Card as="section" className={className}>
            <CardHeader title={title} description={description} />
            <div className="space-y-5">{children}</div>
        </Card>
    );
}

/** The one form-top error: a server failure, or the "fix the highlighted fields" summary (`role="alert"`). */
export function FormErrorSummary({ message }: { message: ReactNode }) {
    return <InlineMessage tone="danger">{message}</InlineMessage>;
}

/** A lookup list failed to load: warns (`role="status"`) and offers a retry. */
export function FormLoadFailedNotice({
    message,
    retryLabel,
    onRetry,
}: {
    message: ReactNode;
    retryLabel: string;
    onRetry: () => void;
}) {
    return (
        <InlineMessage
            tone="warning"
            action={<Button variant="outline" size="compact" onClick={onRetry}>{retryLabel}</Button>}
        >
            {message}
        </InlineMessage>
    );
}

interface FormActionsProps {
    submitLabel: string;
    submitTestId: string;
    isSubmitting: boolean;
    /** Extra reason to keep the submit button inert (e.g. a policy lookup is unavailable). */
    submitDisabled?: boolean;
    /** Renders the Cancel button when set; the caller guards leaving a dirty form. */
    onCancel?: () => void;
    cancelLabel?: string;
    cancelTestId?: string;
    cancelDisabled?: boolean;
    className?: string;
}

/** Cancel (outline) then submit (accent) footer; the submit button shows its pending state. */
export function FormActions({
    submitLabel,
    submitTestId,
    isSubmitting,
    submitDisabled = false,
    onCancel,
    cancelLabel,
    cancelTestId,
    cancelDisabled = false,
    className,
}: FormActionsProps) {
    return (
        <div className={cn('flex items-center justify-end gap-3', className)}>
            {onCancel ? (
                <Button variant="outline" onClick={onCancel} disabled={cancelDisabled} data-testid={cancelTestId}>
                    <X aria-hidden="true" />
                    {cancelLabel}
                </Button>
            ) : null}
            <Button
                type="submit"
                variant="accent"
                isLoading={isSubmitting}
                disabled={submitDisabled}
                data-testid={submitTestId}
            >
                {isSubmitting ? null : <Save aria-hidden="true" />}
                {submitLabel}
            </Button>
        </div>
    );
}
