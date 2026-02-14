import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, AlertTriangle, CalendarClock, ChevronRight, Clock3 } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
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
    const navigate = useNavigate();
    const { t } = useTranslation('dashboard');

    const rows = useMemo<SummaryRow[]>(
        () => [
            {
                key: 'open',
                label: t('issues.summary.open'),
                value: issueSummary.open_issues,
                kind: 'drilldown',
                href: buildIssuesDrilldownHref(),
                Icon: AlertCircle,
                iconClassName: 'text-amber-300',
            },
            {
                key: 'overdue',
                label: t('issues.summary.overdue'),
                value: issueSummary.overdue_issues,
                kind: 'drilldown',
                href: buildIssuesDrilldownHref({ overdue: 'true' }),
                Icon: Clock3,
                iconClassName: 'text-rose-300',
            },
            {
                key: 'high_critical_open',
                label: t('issues.summary.high_critical_open'),
                value: issueSummary.high_severity_open,
                kind: 'drilldown',
                href: buildIssuesDrilldownHref({ severity_group: 'high_critical' }),
                Icon: AlertTriangle,
                iconClassName: 'text-orange-300',
            },
            {
                key: 'median_age_days',
                label: t('issues.summary.median_age_days'),
                value: issueSummary.median_days_open,
                kind: 'metric',
                Icon: CalendarClock,
                iconClassName: 'text-sky-300',
            },
        ],
        [issueSummary.high_severity_open, issueSummary.median_days_open, issueSummary.open_issues, issueSummary.overdue_issues, t]
    );

    return (
        <div className="glass-card">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-300">
                {t('issues.summary.title')}
            </h3>
            <div className="space-y-2">
                {rows.map((row) => {
                    if (row.kind === 'drilldown' && row.href) {
                        const href = row.href;
                        return (
                            <button
                                key={row.key}
                                type="button"
                                onClick={() => navigate(href)}
                                className="w-full rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 transition-all hover:border-accent/40 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-0"
                                aria-label={`${row.label}: ${row.value}`}
                            >
                                <span className="flex items-center gap-3">
                                    <row.Icon className={`h-4 w-4 shrink-0 ${row.iconClassName}`} aria-hidden="true" />
                                    <span className="min-w-0 flex-1 text-left text-sm text-slate-200">{row.label}</span>
                                    <span className="text-base font-bold text-white">{row.value}</span>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                                </span>
                            </button>
                        );
                    }

                    return (
                        <div
                            key={row.key}
                            className="w-full rounded-xl border border-white/5 bg-white/[0.01] px-3 py-2.5"
                            aria-label={`${row.label}: ${row.value}`}
                        >
                            <span className="flex items-center gap-3">
                                <row.Icon className={`h-4 w-4 shrink-0 ${row.iconClassName}`} aria-hidden="true" />
                                <span className="min-w-0 flex-1 text-left">
                                    <span className="block text-sm text-slate-300">{row.label}</span>
                                    <span className="block text-[11px] text-slate-500">{t('issues.summary.aggregate_metric_hint')}</span>
                                </span>
                                <span className="text-base font-bold text-white">{row.value}</span>
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
