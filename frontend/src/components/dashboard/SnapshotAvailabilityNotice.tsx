import { AlertTriangle } from 'lucide-react';

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
        <div className="mb-4 flex items-center gap-2 bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-warning-text flex-shrink-0" />
            <span className="text-xs text-warning-text">
                {t('quarterly.no_snapshot_banner', {
                    period: missingPeriods.join(', ') || fallbackPeriod || t('quarterly.last_quarter'),
                })}
            </span>
        </div>
    );
}
