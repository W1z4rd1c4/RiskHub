import { CheckCircle, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ApprovalQueuedBannerProps {
    closeLabel: string;
    message: string;
    onClose: () => void;
    title: string;
    viewApprovalsLabel: string;
}

export function ApprovalQueuedBanner({
    closeLabel,
    message,
    onClose,
    title,
    viewApprovalsLabel,
}: ApprovalQueuedBannerProps) {
    return (
        <div
            data-testid="approval-queued-banner"
            className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2"
        >
            <Clock className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
                <p className="text-amber-200 text-sm font-medium">{title}</p>
                <p className="text-amber-400/80 text-xs mt-1">{message}</p>
                <div className="mt-3 flex gap-3">
                    <Link
                        to="/approvals"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 hover:text-amber-100 transition-colors"
                    >
                        <CheckCircle className="h-3.5 w-3.5" />
                        {viewApprovalsLabel}
                    </Link>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        {closeLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
