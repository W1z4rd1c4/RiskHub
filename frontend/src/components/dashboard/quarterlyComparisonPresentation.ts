export interface MetricChange {
    absolute: number;
    percentage: number;
    direction: 'up' | 'down' | 'same' | 'unknown';
    note?: string;
}

export interface SnapshotInfo {
    current_quarter: string;
    last_quarter: string;
    last_quarter_snapshot_available: boolean;
    current_quarter_snapshot_available?: boolean;
    missing_snapshot_quarters?: string[];
    snapshot_sources?: {
        current: 'live' | 'stored' | 'missing';
        compare: 'stored' | 'missing';
    };
    missing_snapshot_metrics?: {
        current: string[];
        compare: string[];
    };
    period_metrics: string[];
    snapshot_metrics: string[];
}

export interface QuarterlyData {
    this_quarter: Record<string, number>;
    last_quarter: Record<string, number>;
    changes: Record<string, MetricChange>;
    period: { this_start: string; this_end: string; last_start: string; last_end: string };
    snapshot_info?: SnapshotInfo;
}

export interface QuarterOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export interface QuarterSelection {
    year: number;
    quarter: number;
}

export interface SnapshotAvailability {
    currentSnapshotAvailable: boolean;
    compareSnapshotAvailable: boolean;
    snapshotAvailable: boolean;
    snapshotMetrics: Set<string>;
    missingSnapshotPeriods: string[];
    missingCurrentSnapshotMetrics: Set<string>;
    missingCompareSnapshotMetrics: Set<string>;
}

export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;

const METRIC_COLORS: Record<string, { positive: string; negative: string }> = {
    new_risks: { positive: 'text-rose-400', negative: 'text-emerald-400' },
    archived_risks: { positive: 'text-emerald-400', negative: 'text-rose-400' },
    active_risks: { positive: 'text-rose-400', negative: 'text-emerald-400' },
    priority_risks: { positive: 'text-rose-400', negative: 'text-emerald-400' },
    kri_breaches: { positive: 'text-rose-400', negative: 'text-emerald-400' },
    pending_approvals: { positive: 'text-amber-400', negative: 'text-emerald-400' },
    audit_activity: { positive: 'text-emerald-400', negative: 'text-rose-400' },
    failed_audits: { positive: 'text-rose-400', negative: 'text-emerald-400' },
    control_coverage: { positive: 'text-emerald-400', negative: 'text-rose-400' },
    unaudited_controls: { positive: 'text-rose-400', negative: 'text-emerald-400' },
    orphaned_items: { positive: 'text-rose-400', negative: 'text-emerald-400' },
    kri_health: { positive: 'text-emerald-400', negative: 'text-rose-400' },
    overdue_kris: { positive: 'text-rose-400', negative: 'text-emerald-400' },
    activity_volume: { positive: 'text-slate-400', negative: 'text-slate-400' },
    risks_without_kri: { positive: 'text-rose-400', negative: 'text-emerald-400' },
    active_vendors: { positive: 'text-slate-400', negative: 'text-slate-400' },
};

export function getChangeColor(key: string, direction: string): string {
    const colors = METRIC_COLORS[key] ?? { positive: 'text-slate-400', negative: 'text-slate-400' };
    if (direction === 'same' || direction === 'unknown') {
        return 'text-slate-400';
    }
    return direction === 'up' ? colors.positive : colors.negative;
}

export function parseQuarterLabel(label: string): QuarterSelection {
    const match = label.match(/^(\d{4})-Q([1-4])$/);
    if (!match) {
        return getCurrentQuarterSelection();
    }
    return { year: Number.parseInt(match[1], 10), quarter: Number.parseInt(match[2], 10) };
}

export function toQuarterLabel(year: number, quarter: number): string {
    return `${year}-Q${quarter}`;
}

export function getCurrentQuarterSelection(): QuarterSelection {
    const now = new Date();
    return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

export function getPreviousQuarter(year: number, quarter: number): QuarterSelection {
    if (quarter === 1) {
        return { year: year - 1, quarter: 4 };
    }
    return { year, quarter: quarter - 1 };
}

function quarterKey(year: number, quarter: number): number {
    return year * 4 + quarter;
}

export function isAfterQuarter(year: number, quarter: number, maxYear: number, maxQuarter: number): boolean {
    return quarterKey(year, quarter) > quarterKey(maxYear, maxQuarter);
}

export function isCompareQuarterInvalid(
    compareYear: number,
    compareQuarter: number,
    currentYear: number,
    currentQuarter: number,
): boolean {
    return quarterKey(compareYear, compareQuarter) >= quarterKey(currentYear, currentQuarter);
}

export function buildYearOptions(
    availableYears: number[],
    currentYear: number | null,
    compareYear: number | null,
): QuarterOption[] {
    const years = new Set(availableYears);
    if (currentYear) {
        years.add(currentYear);
    }
    if (compareYear) {
        years.add(compareYear);
    }
    return Array.from(years)
        .sort((a, b) => a - b)
        .map((year) => ({ value: year.toString(), label: year.toString() }));
}

export function buildCurrentQuarterOptions(
    currentYear: number | null,
    actualCurrentYear: number | null,
    actualCurrentQuarter: number | null,
): QuarterOption[] {
    return QUARTERS.map((label, index) => {
        const quarter = index + 1;
        return {
            value: quarter.toString(),
            label,
            disabled: Boolean(
                actualCurrentYear
                && actualCurrentQuarter
                && currentYear
                && isAfterQuarter(currentYear, quarter, actualCurrentYear, actualCurrentQuarter),
            ),
        };
    });
}

export function buildCompareQuarterOptions(
    compareYear: number | null,
    currentYear: number | null,
    currentQuarter: number | null,
): QuarterOption[] {
    return QUARTERS.map((label, index) => {
        const quarter = index + 1;
        return {
            value: quarter.toString(),
            label,
            disabled: Boolean(
                compareYear
                && currentYear
                && currentQuarter
                && isCompareQuarterInvalid(compareYear, quarter, currentYear, currentQuarter),
            ),
        };
    });
}

export function getSnapshotAvailability(data: QuarterlyData | null): SnapshotAvailability {
    const currentSnapshotAvailable = data?.snapshot_info?.current_quarter_snapshot_available ?? true;
    const compareSnapshotAvailable = data?.snapshot_info?.last_quarter_snapshot_available ?? true;
    return {
        currentSnapshotAvailable,
        compareSnapshotAvailable,
        snapshotAvailable: currentSnapshotAvailable && compareSnapshotAvailable,
        snapshotMetrics: new Set(data?.snapshot_info?.snapshot_metrics ?? []),
        missingSnapshotPeriods: data?.snapshot_info?.missing_snapshot_quarters ?? [],
        missingCurrentSnapshotMetrics: new Set(data?.snapshot_info?.missing_snapshot_metrics?.current ?? []),
        missingCompareSnapshotMetrics: new Set(data?.snapshot_info?.missing_snapshot_metrics?.compare ?? []),
    };
}
