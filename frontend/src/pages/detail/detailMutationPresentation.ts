import type { DetailActionMessage } from './DetailActionBanner';

export type DetailMutationTone = 'error' | 'pending';

export interface DetailMutationPresentation {
    showApprovalLink: boolean;
    tone: DetailMutationTone;
}

interface DetailMutationPresentationOptions {
    approvalsLabel?: string;
    message: DetailActionMessage;
    onNavigateApprovals?: () => void;
    pendingText?: string;
}

export function buildDetailMutationPresentation({
    approvalsLabel,
    message,
    onNavigateApprovals,
    pendingText,
}: DetailMutationPresentationOptions): DetailMutationPresentation {
    const tone = message.isError ? 'error' : 'pending';

    return {
        showApprovalLink: !message.isError && Boolean(pendingText && approvalsLabel && onNavigateApprovals),
        tone,
    };
}
