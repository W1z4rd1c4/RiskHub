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
        <div className="mb-4 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
            <span className="text-xs text-amber-300">
                {t('quarterly.no_snapshot_banner', {
                    period: missingPeriods.join(', ') || fallbackPeriod || t('quarterly.last_quarter'),
                })}
            </span>
        </div>
    );
}
