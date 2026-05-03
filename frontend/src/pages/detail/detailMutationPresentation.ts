import type { DetailActionMessage } from './DetailActionBanner';

export type DetailMutationTone = 'error' | 'pending';

export interface DetailMutationPresentation {
    className: string;
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
        className: tone === 'error'
            ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            : 'bg-amber-500/10 border-amber-500/20 text-amber-400',
        showApprovalLink: !message.isError && Boolean(pendingText && approvalsLabel && onNavigateApprovals),
        tone,
    };
}
