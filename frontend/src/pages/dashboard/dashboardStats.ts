import type { LucideIcon } from 'lucide-react';
import {
    AlertCircle,
    AlertTriangle,
    Building2,
    CheckCircle,
    ClipboardList,
    Handshake,
} from 'lucide-react';

import type { DashboardFilters, DashboardOverview, DashboardSummary } from '@/types/dashboard';
import { buildRegisterUrlParams, type RegisterFilters } from '@/pages/shared/registerListQuery';
import { classifyRiskScore, severityClass, type SeverityBand } from '@/lib/severity';

/** Canonical register URLs and exact same-page population destinations. */
function registerDestination(path: string, filters: RegisterFilters): string {
    const query = buildRegisterUrlParams({ filters, page: 1, search: '', selectedGroupValue: null, sort: null, view: 'all' });
    return query.size > 0 ? `${path}?${query.toString()}` : path;
}

export const DEPARTMENT_POPULATION_ANCHOR = 'dashboard-departments';

export function populatedDashboardDepartments(metrics: DashboardOverview['department_metrics']) {
    return metrics.filter((metric) => metric.risk_count > 0 || metric.control_count > 0);
}

function scopedRegisterDestination(resource: 'risks' | 'controls', departmentId: number | null, filters: RegisterFilters) {
    const href = registerDestination(departmentId === null ? `/${resource}` : `/departments/${departmentId}`, filters);
    return departmentId === null ? href : `${href}${href.includes('?') ? '&' : '?'}tab=${resource}`;
}

/** A selected Department is actionable only after backend filter authority is known. */
export function buildKriBreachRiskDestination(departmentId: number | null, canUseDepartmentFilter?: boolean): string | null {
    if (departmentId !== null && canUseDepartmentFilter !== true) return null;
    return scopedRegisterDestination('risks', departmentId, { has_breach: true, status: 'all' });
}

/** Each destination carries only the filters actually applied to its population. */
export function buildDashboardDrillthrough(filters: Pick<DashboardFilters, 'departmentId'> & Partial<Pick<DashboardFilters, 'riskLevel' | 'controlForm' | 'controlStatus'>>) {
    const department = filters.departmentId === null ? {} : { department_id: filters.departmentId };
    const issues = { include_closed: false, exclude_active_exceptions: true, ...department };
    const riskFilters = { status: 'all', risk_level: filters.riskLevel === 'all' ? undefined : filters.riskLevel };
    const riskDestination = (extra: RegisterFilters = {}) => scopedRegisterDestination('risks', filters.departmentId, { ...riskFilters, ...extra });
    return {
        controls: scopedRegisterDestination('controls', filters.departmentId, { control_form: filters.controlForm || undefined, status: filters.controlStatus || undefined }),
        risks: { all: riskDestination(), critical: riskDestination({ critical: true }) },
        issues: {
            open: registerDestination('/issues', issues),
            overdue: registerDestination('/issues', { ...issues, overdue: true }),
            highSeverity: registerDestination('/issues', { ...issues, severity_group: 'high_critical' }),
        },
        kris: {
            overdue: registerDestination('/kris', { ...department, monitoring_status: 'not_submitted' }),
            dueSoon: registerDestination('/kris', { ...department, timeliness_status: 'due_soon' }),
        },
        vendors: registerDestination('/vendors', filters.departmentId === null ? {} : { department_ids: [filters.departmentId] }),
        // Committee is independently actor-scoped; overview filters do not apply.
        committee: {
            criticalRisks: registerDestination('/risks', { critical: true }),
            highRiskVendors: registerDestination('/vendors', { risk_scores: [4, 5] }),
        },
    };
}

export type DashboardDrillthrough = ReturnType<typeof buildDashboardDrillthrough>;

export type DashboardStat = {
    bg: string;
    color: string;
    icon: LucideIcon;
    path: string;
    unavailableReason?: string;
    title: string;
    /** D1: the band of a severity-coloured value; rendered as a visible label with `context`. */
    band?: SeverityBand;
    context?: string;
    value: number;
};

interface BuildDashboardStatsOptions {
    filters: DashboardFilters;
    canReadControls: boolean;
    canReadDepartments?: boolean;
    canReadIssues: boolean;
    canReadVendors: boolean;
    departmentMetrics: DashboardOverview['department_metrics'];
    issueSummary: DashboardOverview['issue_summary'] | null | undefined;
    summary: DashboardSummary | null | undefined;
    t: (key: string) => string;
}

function departmentDestinationUnavailable(filters: DashboardFilters, canReadDepartments: boolean | undefined, t: (key: string) => string) {
    return filters.departmentId !== null && canReadDepartments !== true ? t('dashboard:destinations.department_unavailable') : undefined;
}

export function buildDashboardStats({
    filters,
    canReadControls,
    canReadDepartments,
    canReadIssues,
    canReadVendors,
    departmentMetrics,
    issueSummary,
    summary,
    t,
}: BuildDashboardStatsOptions): DashboardStat[] {
    const links = buildDashboardDrillthrough(filters);
    const unavailableReason = departmentDestinationUnavailable(filters, canReadDepartments, t);
    const averageBand = summary && summary.total_risks > 0
        ? classifyRiskScore(summary.average_net_risk_score, summary.risk_thresholds)
        : null;
    const stats: DashboardStat[] = [];

    if (canReadControls) {
        stats.push({
            title: t('stats.total_controls'),
            value: summary?.total_controls ?? 0,
            icon: ClipboardList,
            color: 'text-accent-text',
            bg: 'bg-accent/10',
            path: links.controls,
            unavailableReason,
        });
    }

    stats.push(
        {
            title: t('stats.active_depts'),
            value: populatedDashboardDepartments(departmentMetrics).length,
            icon: Building2,
            color: 'text-chart-2',
            bg: 'bg-chart-2/10',
            path: `#${DEPARTMENT_POPULATION_ANCHOR}`,
        },
        {
            title: t('stats.critical_risks'),
            value: summary?.critical_risks_count ?? 0,
            icon: AlertTriangle,
            color: 'text-destructive',
            bg: 'bg-destructive/10',
            path: links.risks.critical,
            unavailableReason,
        },
        {
            title: t('stats.avg_risk_score'),
            value: summary?.average_net_risk_score ?? 0,
            icon: CheckCircle,
            color: averageBand ? severityClass('text', averageBand) : 'text-muted-foreground',
            bg: averageBand ? severityClass('card', averageBand) : 'bg-tint/5',
            band: averageBand ?? undefined,
            context: averageBand ? t(`risk_levels.${averageBand}`) : undefined,
            path: links.risks.all,
            unavailableReason,
        },
    );

    if (canReadVendors) {
        stats.push({
            title: t('stats.vendors'),
            value: summary?.total_vendors ?? 0,
            icon: Handshake,
            color: 'text-accent-text',
            bg: 'bg-info/10',
            path: links.vendors,
        });
    }

    if (canReadIssues) {
        stats.push({
            title: t('issues.summary.open_issues'),
            value: issueSummary?.open_issues ?? 0,
            icon: AlertCircle,
            color: 'text-warning-text',
            bg: 'bg-warning/10',
            path: links.issues.open,
        });
    }

    return stats;
}
