import { BADGE_TONES, type BadgeTone } from '@/lib/tones';
import type { ControlMonitoringStatus } from '@/types/control';
import type { KRIMonitoringStatus, KRITimelinessStatus } from '@/types/kri';

// Status tones live in `lib/tones.ts` (audit 2026-09-30 §4.4 A); the
// monitoring metas below are built on them.

type MonitoringMeta<TStatus extends string> = BadgeTone & {
    labelKey: string;
    sortPriority: number;
    status: TStatus;
};

const CONTROL_MONITORING_META: Record<ControlMonitoringStatus, MonitoringMeta<ControlMonitoringStatus>> = {
    new: {
        status: 'new',
        labelKey: 'controls:monitoring.new',
        sortPriority: 0,
        ...BADGE_TONES.info,
    },
    needs_review: {
        status: 'needs_review',
        labelKey: 'controls:monitoring.needs_review',
        sortPriority: 1,
        ...BADGE_TONES.warning,
    },
    failed: {
        status: 'failed',
        labelKey: 'controls:monitoring.failed',
        sortPriority: 2,
        ...BADGE_TONES.danger,
    },
    passed: {
        status: 'passed',
        labelKey: 'controls:monitoring.passed',
        sortPriority: 3,
        ...BADGE_TONES.success,
    },
};

const KRI_MONITORING_META: Record<KRIMonitoringStatus, MonitoringMeta<KRIMonitoringStatus>> = {
    new: {
        status: 'new',
        labelKey: 'kris:monitoring.new',
        sortPriority: 0,
        ...BADGE_TONES.info,
    },
    not_submitted: {
        status: 'not_submitted',
        labelKey: 'kris:monitoring.not_submitted',
        sortPriority: 1,
        ...BADGE_TONES.warning,
    },
    breach: {
        status: 'breach',
        labelKey: 'kris:monitoring.breach',
        sortPriority: 2,
        ...BADGE_TONES.danger,
    },
    warning: {
        status: 'warning',
        labelKey: 'kris:monitoring.warning',
        sortPriority: 3,
        ...BADGE_TONES.warning,
    },
    optimal: {
        status: 'optimal',
        labelKey: 'kris:monitoring.optimal',
        sortPriority: 4,
        ...BADGE_TONES.success,
    },
};

const CONTROL_MONITORING_FALLBACK: MonitoringMeta<'unknown'> = {
    status: 'unknown',
    labelKey: 'common:labels.not_available',
    sortPriority: 999,
    ...BADGE_TONES.neutral,
};

const KRI_MONITORING_FALLBACK: MonitoringMeta<'unknown'> = {
    status: 'unknown',
    labelKey: 'common:labels.not_available',
    sortPriority: 999,
    ...BADGE_TONES.neutral,
};

export const CONTROL_MONITORING_FILTER_VALUES = ['new', 'needs_review', 'failed', 'passed'] as const;
export const KRI_MONITORING_FILTER_VALUES = ['new', 'not_submitted', 'breach', 'warning', 'optimal'] as const;
export const KRI_TIMELINESS_FILTER_VALUES: KRITimelinessStatus[] = ['due_soon'];

export function getControlMonitoringMeta(status?: ControlMonitoringStatus | null) {
    if (!status) {
        return CONTROL_MONITORING_FALLBACK;
    }
    return CONTROL_MONITORING_META[status] ?? CONTROL_MONITORING_FALLBACK;
}

export function getKriMonitoringMeta(status?: KRIMonitoringStatus | null) {
    if (!status) {
        return KRI_MONITORING_FALLBACK;
    }
    return KRI_MONITORING_META[status] ?? KRI_MONITORING_FALLBACK;
}
