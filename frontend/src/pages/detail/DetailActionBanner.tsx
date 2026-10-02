import { Button } from '@/components/ui/button';
import { InlineMessage } from '@/components/ui/inline-message';

import { buildDetailMutationPresentation } from './detailMutationPresentation';

export interface DetailActionMessage {
    key: string;
    isError?: boolean;
}

interface DetailActionBannerProps {
    message: DetailActionMessage;
    messageText: string;
    pendingText?: string;
    approvalsLabel?: string;
    sectionSuffix?: string;
    onClose: () => void;
    onNavigateApprovals?: () => void;
}

/**
 * Detail-page mutation outcome (AX-05, §4.10): keeps its API and renders
 * `InlineMessage`, so a failure is announced (`role="alert"`) and a queued
 * approval is a polite status with a link to the approvals queue.
 */
export function DetailActionBanner({
    approvalsLabel,
    message,
    messageText,
    onClose,
    onNavigateApprovals,
    pendingText,
    sectionSuffix,
}: DetailActionBannerProps) {
    const presentation = buildDetailMutationPresentation({
        approvalsLabel,
        message,
        onNavigateApprovals,
        pendingText,
    });

    return (
        <InlineMessage tone={presentation.tone === 'error' ? 'danger' : 'warning'} onDismiss={onClose}>
            <p className="font-medium">{messageText}</p>
            {presentation.showApprovalLink ? (
                <p className="mt-1 text-xs">
                    {pendingText}{' '}
                    <Button
                        variant="link"
                        size={null}
                        onClick={onNavigateApprovals}
                        className="h-auto whitespace-normal p-0 align-baseline text-xs font-normal text-current underline hover:no-underline"
                    >
                        {approvalsLabel}
                    </Button>
                    {sectionSuffix ? ` ${sectionSuffix}` : null}
                </p>
            ) : null}
        </InlineMessage>
    );
}
