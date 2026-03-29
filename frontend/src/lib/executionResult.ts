import {
    AlertTriangle,
    CheckCircle,
    HelpCircle,
    MinusCircle,
    type LucideIcon,
    XCircle,
} from 'lucide-react';

import type { ExecutionResult } from '@/types/execution';

type ExecutionResultMeta = {
    badgeClassName: string;
    iconClassName: string;
    icon: LucideIcon;
    labelKey: string;
    status: ExecutionResult | 'unknown';
};

const EXECUTION_RESULT_META: Record<ExecutionResult, ExecutionResultMeta> = {
    passed: {
        status: 'passed',
        badgeClassName: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
        iconClassName: 'text-emerald-400',
        icon: CheckCircle,
        labelKey: 'controls:results.passed',
    },
    failed: {
        status: 'failed',
        badgeClassName: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
        iconClassName: 'text-rose-400',
        icon: XCircle,
        labelKey: 'controls:results.failed',
    },
    warning: {
        status: 'warning',
        badgeClassName: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
        iconClassName: 'text-amber-400',
        icon: AlertTriangle,
        labelKey: 'controls:executions.issues_found',
    },
    not_applicable: {
        status: 'not_applicable',
        badgeClassName: 'text-slate-400 bg-slate-400/10 border-slate-400/20',
        iconClassName: 'text-slate-400',
        icon: MinusCircle,
        labelKey: 'controls:results.not_applicable',
    },
};

const UNKNOWN_EXECUTION_RESULT_META: ExecutionResultMeta = {
    status: 'unknown',
    badgeClassName: 'text-slate-300 bg-white/5 border-white/10',
    iconClassName: 'text-slate-300',
    icon: HelpCircle,
    labelKey: 'common:labels.not_available',
};

export function getExecutionResultMeta(result?: ExecutionResult | null) {
    if (!result) {
        return UNKNOWN_EXECUTION_RESULT_META;
    }
    return EXECUTION_RESULT_META[result] ?? UNKNOWN_EXECUTION_RESULT_META;
}
