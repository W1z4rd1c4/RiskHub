import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, CalendarClock, ChevronRight, Clock3 } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import { useFormat, useTranslation } from '@/i18n/hooks';
import type { IssueDashboardSummary } from '@/types/dashboard';

interface IssuesSummaryCardProps {
    issueSummary: IssueDashboardSummary;
}

interface SummaryRow {
    key: string;
    label: string;
    value: number;
    kind: 'drilldown' | 'metric';
    href?: string;
    Icon: typeof AlertCircle;
    iconClassName: string;
}

const DASHBOARD_PARITY_QUERY: Record<string, string> = {
    include_closed: 'false',
    exclude_active_exceptions: 'true',
};

function buildIssuesDrilldownHref(extraQuery: Record<string, string> = {}): string {
    const params = new URLSearchParams({
        ...DASHBOARD_PARITY_QUERY,
        ...extraQuery,
    });
    return `/issues?${params.toString()}`;
}

export function IssuesSummaryCard({ issueSummary }: IssuesSummaryCardProps) {
    const { t } = useTranslation('dashboard');
    const format = useFormat();

    const rows = useMemo<SummaryRow[]>(
        () => [
            {
                key: 'open',
                label: t('issues.summary.open'),
                value: issueSummary.open_issues,
                kind: 'drilldown',
                href: buildIssuesDrilldownHref(),
                Icon: AlertCircle,
                iconClassName: 'text-warning-text',
            },
            {
                key: 'overdue',
                label: t('issues.summary.overdue'),
                value: issueSummary.overdue_issues,
                kind: 'drilldown',
                href: buildIssuesDrilldownHref({ overdue: 'true' }),
                Icon: Clock3,
                iconClassName: 'text-destructive',
            },
            {
                key: 'high_critical_open',
                label: t('issues.summary.high_critical_open'),
                value: issueSummary.high_severity_open,
                kind: 'drilldown',
                href: buildIssuesDrilldownHref({ severity_group: 'high_critical' }),
                Icon: AlertTriangle,
                iconClassName: 'text-severity-high-text',
            },
            {
                key: 'median_age_days',
                label: t('issues.summary.median_age_days'),
                value: issueSummary.median_days_open,
                kind: 'metric',
                Icon: CalendarClock,
                iconClassName: 'text-accent-text',
            },
        ],
        [issueSummary.high_severity_open, issueSummary.median_days_open, issueSummary.open_issues, issueSummary.overdue_issues, t]
    );

    return (
        <Card as="section" className="h-full">
            <CardHeader title={t('issues.summary.title')} />
            <div className="space-y-2">
                {rows.map((row) => {
                    if (row.kind === 'drilldown' && row.href) {
                        return (
                            <Link
                                key={row.key}
                                to={row.href}
                                aria-label={`${row.label}: ${format.number(row.value)}`}
                                data-testid={`issues-summary-${row.key}`}
                                className="block w-full rounded-xl border border-border bg-tint/[0.03] px-3 py-2.5 transition-colors hover:border-accent/40 hover:bg-tint/5 focus-ring"
                            >
                                <span className="flex items-center gap-3">
                                    <row.Icon className={`h-4 w-4 shrink-0 ${row.iconClassName}`} aria-hidden="true" />
                                    <span className="min-w-0 flex-1 text-left text-sm text-foreground">{row.label}</span>
                                    <span className="text-base font-bold tabular-nums text-foreground">{format.number(row.value)}</span>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                </span>
                            </Link>
                        );
                    }

                    return (
                        <div
                            key={row.key}
                            data-testid={`issues-summary-${row.key}`}
                            className="w-full rounded-xl border border-border bg-tint/[0.03] px-3 py-2.5"
                        >
                            <span className="flex items-center gap-3">
                                <row.Icon className={`h-4 w-4 shrink-0 ${row.iconClassName}`} aria-hidden="true" />
                                <span className="min-w-0 flex-1 text-left">
                                    <span className="block text-sm text-foreground">{row.label}</span>
                                    <span className="block text-xs text-muted-foreground">{t('issues.summary.aggregate_metric_hint')}</span>
                                </span>
                                <span className="text-base font-bold tabular-nums text-foreground">{format.number(row.value)}</span>
                            </span>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
