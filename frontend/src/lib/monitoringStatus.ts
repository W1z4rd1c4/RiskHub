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
    gaugeClassName: string;
    icon: LucideIcon;
};

type MonitoringMeta<TStatus extends string> = BadgeTone & {
    labelKey: string;
    sortPriority: number;
    status: TStatus;
};

const BADGE_TONES = {
    success: {
        badgeClassName: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
        textClassName: 'text-emerald-400',
        gaugeClassName: 'bg-emerald-500 shadow-lg shadow-emerald-500/35',
        icon: CheckCircle2,
    },
    warning: {
        badgeClassName: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
        textClassName: 'text-amber-400',
        gaugeClassName: 'bg-amber-500 shadow-lg shadow-amber-500/35',
        icon: Clock3,
    },
    danger: {
        badgeClassName: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
        textClassName: 'text-rose-400',
        gaugeClassName: 'bg-rose-500 shadow-lg shadow-rose-500/35',
        icon: AlertTriangle,
    },
    info: {
        badgeClassName: 'bg-sky-500/10 text-sky-300 border border-sky-500/20',
        textClassName: 'text-sky-300',
        gaugeClassName: 'bg-sky-400 shadow-lg shadow-sky-400/35',
        icon: Sparkles,
    },
    neutral: {
        badgeClassName: 'bg-white/10 text-slate-300 border border-white/10',
        textClassName: 'text-slate-300',
        gaugeClassName: 'bg-slate-500 shadow-lg shadow-slate-500/35',
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
