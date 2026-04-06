import { Clock, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useTranslation } from '@/i18n/hooks';

interface KriApprovalQueuedBannerProps {
    message: string;
    onClose: () => void;
}

export function KriApprovalQueuedBanner({
    message,
    onClose,
}: KriApprovalQueuedBannerProps) {
    const { t } = useTranslation(['approvals', 'common', 'errorKeys']);

    return (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
                <div className="flex-1">
                    <p className="text-sm font-medium text-amber-200">
                        {t('approval_submitted', { ns: 'errorKeys' })}
                    </p>
                    <p className="mt-1 text-xs text-amber-400/80">
                        {message.startsWith('errorKeys.')
                            ? t(message, { ns: 'errorKeys' })
                            : message}
                    </p>
                    <div className="mt-3 flex gap-3">
                        <Link
                            to="/approvals"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 transition-colors hover:text-amber-100"
                        >
                            <CheckCircle className="h-3.5 w-3.5" />
                            {t('common:actions.view')} {t('approvals:title', { defaultValue: 'Approvals' })}
                        </Link>
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-xs text-slate-500 transition-colors hover:text-slate-300"
                        >
                            {t('common:actions.close')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
