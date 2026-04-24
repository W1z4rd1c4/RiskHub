import { AlertCircle, XCircle } from 'lucide-react';

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
    return (
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${message.isError
            ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            }`}>
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
                <p className="text-sm font-medium">{messageText}</p>
                {!message.isError && pendingText && approvalsLabel && onNavigateApprovals ? (
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
