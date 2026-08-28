import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    type LucideIcon,
    ShieldQuestion,
    Sparkles,
} from 'lucide-react';

import type { ControlMonitoringStatus } from '@/types/control';
import type { KRIMonitoringStatus, KRITimelinessStatus } from '@/types/kri';

type BadgeTone = {
    badgeClassName: string;
    textClassName: string;
    gaugeToneClassName: string;
    gaugeZoneClassName: string;
    icon: LucideIcon;
};

type MonitoringMeta<TStatus extends string> = BadgeTone & {
    labelKey: string;
    sortPriority: number;
    status: TStatus;
};

const BADGE_TONES = {
    success: {
        badgeClassName: 'bg-success/10 text-success-text border border-success/20',
        textClassName: 'text-success-text',
        gaugeToneClassName: 'text-success-text',
        gaugeZoneClassName: 'text-success/20',
        icon: CheckCircle2,
    },
    warning: {
        badgeClassName: 'bg-warning/10 text-warning-text border border-warning/20',
        textClassName: 'text-warning-text',
        gaugeToneClassName: 'text-warning-text',
        gaugeZoneClassName: 'text-warning/20',
        icon: Clock3,
    },
    danger: {
        badgeClassName: 'bg-destructive/10 text-destructive border border-destructive/20',
        textClassName: 'text-destructive',
        gaugeToneClassName: 'text-destructive',
        gaugeZoneClassName: 'text-destructive/20',
        icon: AlertTriangle,
    },
    info: {
        badgeClassName: 'bg-info/10 text-accent-text border border-info/20',
        textClassName: 'text-accent-text',
        gaugeToneClassName: 'text-accent-text',
        gaugeZoneClassName: 'text-info/20',
        icon: Sparkles,
    },
    neutral: {
        badgeClassName: 'bg-muted text-muted-foreground border border-border',
        textClassName: 'text-muted-foreground',
        gaugeToneClassName: 'text-muted-foreground',
        gaugeZoneClassName: 'text-muted-foreground/20',
        icon: ShieldQuestion,
    },
} as const;

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
