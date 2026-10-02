import { Lock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

/**
 * Row / header badge for a record with a change waiting for approval (audit
 * §4.9, PG-29). One look and one vocabulary on every register: the visible
 * text is the short `common:columns.pending` ("Pending"), the accessible name
 * and tooltip the full `common:columns.pending_tooltip` ("Pending approval").
 *
 * Callers decide *whether* a change is pending (each module has its own
 * `has_pending_*` capability flags); the badge only renders it.
 */
export interface PendingChangeBadgeProps {
    className?: string;
    'data-testid'?: string;
}

export function PendingChangeBadge({ className, 'data-testid': testId }: PendingChangeBadgeProps) {
    const { t } = useTranslation('common');
    const description = t('columns.pending_tooltip');
    return (
        <Badge
            tone="warning"
            size="sm"
            icon={Lock}
            title={description}
            srLabel={description}
            className={cn('shrink-0', className)}
            data-testid={testId}
        >
            {t('columns.pending')}
        </Badge>
    );
}
