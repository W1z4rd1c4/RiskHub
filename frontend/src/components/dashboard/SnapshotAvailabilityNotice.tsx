import { InlineMessage } from '@/components/ui/inline-message';

interface SnapshotAvailabilityNoticeProps {
    fallbackPeriod: string;
    missingPeriods: string[];
    t: (key: string, options?: Record<string, unknown>) => string;
}

export function SnapshotAvailabilityNotice({
    fallbackPeriod,
    missingPeriods,
    t,
}: SnapshotAvailabilityNoticeProps) {
    return (
        <InlineMessage tone="warning" live="off" className="mb-4 px-3 py-2 text-xs">
            {t('quarterly.no_snapshot_banner', {
                period: missingPeriods.join(', ') || fallbackPeriod || t('quarterly.last_quarter'),
            })}
        </InlineMessage>
    );
}
