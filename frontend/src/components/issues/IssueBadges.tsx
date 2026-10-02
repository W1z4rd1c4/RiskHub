import { Badge, SeverityBadge, type BadgeSize } from '@/components/ui/badge';
import { useTranslation } from '@/i18n/hooks';
import { ISSUE_SEVERITY_BAND } from '@/lib/severity';
import type { Tone } from '@/lib/tones';
import type { IssueSeverity, IssueStatus } from '@/types/issue';

/**
 * Issue vocabulary on the shared `Badge` shell (audit §4.9, DS-13, PG-03):
 * translated status and severity labels; severity paints the D1 scale through
 * `SeverityBadge`.
 */
const ISSUE_STATUS_TONE: Readonly<Record<IssueStatus, Tone>> = {
    open: 'warning',
    triaged: 'info',
    in_progress: 'accent',
    ready_for_validation: 'accent',
    closed: 'success',
};

/** Literal keys so the i18n usage validator sees every label. */
const ISSUE_STATUS_LABEL_KEYS: Readonly<Record<IssueStatus, string>> = {
    open: 'issues:status.open',
    triaged: 'issues:status.triaged',
    in_progress: 'issues:status.in_progress',
    ready_for_validation: 'issues:status.ready_for_validation',
    closed: 'issues:status.closed',
};

const ISSUE_SEVERITY_LABEL_KEYS: Readonly<Record<IssueSeverity, string>> = {
    low: 'issues:severity.low',
    medium: 'issues:severity.medium',
    high: 'issues:severity.high',
    critical: 'issues:severity.critical',
};

interface IssueBadgeBaseProps {
    size?: BadgeSize;
    className?: string;
}

export function IssueStatusBadge({ status, size = 'md', className }: IssueBadgeBaseProps & { status: IssueStatus }) {
    const { t } = useTranslation('issues');
    const labelKey = ISSUE_STATUS_LABEL_KEYS[status];
    return (
        <Badge tone={ISSUE_STATUS_TONE[status] ?? 'neutral'} size={size} className={className} data-status={status}>
            {labelKey ? t(labelKey) : t('common:fallbacks.unknown')}
        </Badge>
    );
}

export function IssueSeverityBadge({ severity, size = 'md', className }: IssueBadgeBaseProps & { severity: IssueSeverity }) {
    const { t } = useTranslation('issues');
    const band = ISSUE_SEVERITY_BAND[severity];
    const labelKey = ISSUE_SEVERITY_LABEL_KEYS[severity];
    const label = labelKey ? t(labelKey) : t('common:fallbacks.unknown');
    if (!band) {
        return <Badge tone="neutral" size={size} className={className}>{label}</Badge>;
    }
    return <SeverityBadge band={band} label={label} size={size} className={className} />;
}
