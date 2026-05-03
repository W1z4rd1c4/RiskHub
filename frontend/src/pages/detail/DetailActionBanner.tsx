import { AlertCircle, XCircle } from 'lucide-react';

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
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${presentation.className}`}>
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
                <p className="text-sm font-medium">{messageText}</p>
                {presentation.showApprovalLink ? (
                    <p className="text-xs mt-1 opacity-75">
                        {pendingText}{' '}
                        <button onClick={onNavigateApprovals} className="underline hover:no-underline">
                            {approvalsLabel}
                        </button>
                        {sectionSuffix ? ` ${sectionSuffix}` : null}
                    </p>
                ) : null}
            </div>
            <button
                onClick={onClose}
                className="ml-auto text-current opacity-50 hover:opacity-100"
            >
                <XCircle className="h-4 w-4" />
            </button>
        </div>
    );
}
