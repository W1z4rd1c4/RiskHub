import { ArrowUpRight, Clock } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { InlineMessage } from '@/components/ui/inline-message';
import { readApprovalQueuedState, withoutApprovalQueuedState } from '@/hooks/useApprovalQueued';
import { useTranslation } from '@/i18n/hooks';
import { approvalRequestHref } from '@/pages/approvals/approvalNavigation';

interface ApprovalQueuedNoticeProps {
    className?: string;
}

/**
 * Persistent pending-approval notice (D12 / PM-2, audit §4.16) rendered by
 * entity pages and registers. It reads the router state written by
 * `useApprovalQueued()`; the success toast already announced the outcome, so
 * the notice itself is a static page note (`live="off"`) with a link to the
 * approval request.
 */
export function ApprovalQueuedNotice({ className }: ApprovalQueuedNoticeProps) {
    const { t } = useTranslation('common');
    const location = useLocation();
    const navigate = useNavigate();
    const queued = readApprovalQueuedState(location.state);

    if (!queued) return null;

    const href = queued.approvalId !== null ? approvalRequestHref(queued.approvalId) : '/approvals';

    return (
        <InlineMessage
            tone="warning"
            live="off"
            icon={Clock}
            title={t('approval.queued.title')}
            data-testid="approval-queued-notice"
            className={className}
            onDismiss={() => {
                void navigate(
                    { pathname: location.pathname, search: location.search, hash: location.hash },
                    { replace: true, state: withoutApprovalQueuedState(location.state) },
                );
            }}
            action={(
                <Link
                    to={href}
                    data-testid="approval-queued-notice-link"
                    className="inline-flex items-center gap-1.5 rounded text-sm font-semibold underline underline-offset-2 hover:no-underline focus-ring"
                >
                    {t('approval.queued.open')}
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
            )}
        >
            {t('approval.queued.body')}
        </InlineMessage>
    );
}
