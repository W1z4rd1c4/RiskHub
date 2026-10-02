import { Star } from 'lucide-react';

import { Badge, type BadgeSize } from '@/components/ui/badge';
import { useTranslation } from '@/i18n/hooks';
import type { Tone } from '@/lib/tones';
import type { RiskDisplayStatus } from '@/pages/risks/risksPagePresentation';

/**
 * Risk vocabulary on the shared `Badge` shell (audit §4.9, PG-03, PG-46):
 * the status is always the translated `risks:status.*` label, never the raw
 * enum, and the priority star carries a translated accessible name.
 */
const RISK_STATUS_TONE: Readonly<Record<RiskDisplayStatus, Tone>> = {
    active: 'success',
    emerging: 'warning',
    archived: 'neutral',
};

/** Literal keys so the i18n usage validator sees every label. */
const RISK_STATUS_LABEL_KEYS: Readonly<Record<RiskDisplayStatus, string>> = {
    active: 'risks:status.active',
    emerging: 'risks:status.emerging',
    archived: 'risks:status.archived',
};

export interface RiskStatusBadgeProps {
    status: RiskDisplayStatus;
    size?: BadgeSize;
    className?: string;
}

export function RiskStatusBadge({ status, size = 'md', className }: RiskStatusBadgeProps) {
    const { t } = useTranslation('risks');
    const labelKey = RISK_STATUS_LABEL_KEYS[status];
    return (
        <Badge tone={RISK_STATUS_TONE[status] ?? 'neutral'} size={size} className={className} data-status={status}>
            {labelKey ? t(labelKey) : status}
        </Badge>
    );
}

/** The priority-risk marker: a star named "Priority risk" for assistive technology. */
export function RiskPriorityBadge({ className }: { className?: string }) {
    const { t } = useTranslation('risks');
    const label = t('risks:priority_label');
    return (
        <span role="img" aria-label={label} title={label} className={className}>
            <Star aria-hidden="true" className="size-4 fill-warning text-warning-text" />
        </span>
    );
}
