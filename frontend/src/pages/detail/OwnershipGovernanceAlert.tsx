import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { InlineMessage } from '@/components/ui/inline-message';

interface OwnershipGovernanceAlertProps {
    /** What is wrong with the record's ownership / stewardship, already translated. */
    message: ReactNode;
    /** Translated label of the governance action; shown with `onAction` only. */
    actionLabel?: string;
    /** Sends an authorised operator to the governance queue; omit for users who cannot. */
    onAction?: () => void;
    testId?: string;
    actionTestId?: string;
}

/**
 * Ownership / stewardship banner on an entity page (audit 2026-09-30 SM-05,
 * §4.14): orphaned, unassigned or invalid owners on Asset, Process and Threat
 * (Vendor adopts it with its own module). Warning tokens through
 * `InlineMessage`; it blocks ordinary edits, so it is announced assertively
 * (`role="alert"`) rather than as a polite status.
 */
export function OwnershipGovernanceAlert({
    message,
    actionLabel,
    onAction,
    testId,
    actionTestId,
}: OwnershipGovernanceAlertProps) {
    return (
        <InlineMessage
            tone="warning"
            live="assertive"
            data-testid={testId}
            action={onAction ? (
                <Button variant="outline" onClick={onAction} data-testid={actionTestId}>
                    {actionLabel}
                </Button>
            ) : undefined}
        >
            <p className="font-medium">{message}</p>
        </InlineMessage>
    );
}
