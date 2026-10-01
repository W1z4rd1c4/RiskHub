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
        badgeClassName: 'text-success-text bg-success/10 border-success/20',
        iconClassName: 'text-success-text',
        icon: CheckCircle,
        labelKey: 'controls:results.passed',
    },
    failed: {
        status: 'failed',
        badgeClassName: 'text-destructive bg-destructive/10 border-destructive/20',
        iconClassName: 'text-destructive',
        icon: XCircle,
        labelKey: 'controls:results.failed',
    },
    warning: {
        status: 'warning',
        badgeClassName: 'text-warning-text bg-warning/10 border-warning/20',
        iconClassName: 'text-warning-text',
        icon: AlertTriangle,
        labelKey: 'controls:executions.issues_found',
    },
    not_applicable: {
        status: 'not_applicable',
        badgeClassName: 'text-muted-foreground bg-muted-foreground/10 border-muted-foreground/20',
        iconClassName: 'text-muted-foreground',
        icon: MinusCircle,
        labelKey: 'controls:results.not_applicable',
    },
};

const UNKNOWN_EXECUTION_RESULT_META: ExecutionResultMeta = {
    status: 'unknown',
    badgeClassName: 'text-foreground bg-tint/5 border-border',
    iconClassName: 'text-foreground',
    icon: HelpCircle,
    labelKey: 'common:labels.not_available',
};

export function getExecutionResultMeta(result?: ExecutionResult | null) {
    if (!result) {
        return UNKNOWN_EXECUTION_RESULT_META;
    }
    return EXECUTION_RESULT_META[result] ?? UNKNOWN_EXECUTION_RESULT_META;
}
