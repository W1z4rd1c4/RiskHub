import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, Building2, Clock, Handshake, Star } from 'lucide-react';
import type { DashboardCommitteeSummary } from '@/services/dashboardApi';
import { useFormat, type SafeTFunction } from '@/i18n/hooks';
import { buildVendorDetailPath } from '@/pages/vendors/vendorDetailPresentation';
import { useRiskThresholds } from '@/hooks/useRiskHubConfig';
import { classifyRiskScore, ordinalSeverityBand, severityClass, type SeverityBand } from '@/lib/severity';
import type { StatusTone } from '@/lib/tones';
import { cn } from '@/lib/utils';
import { Badge, SeverityBadge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState, Skeleton } from '@/components/ui/state';
import { translateCode } from '@/lib/humanizeCode';
import { QuarterlyComparisonWidget } from './QuarterlyComparisonWidget';

/** Activity actions → status tones (lib/tones.ts); unknown actions stay neutral. */
const ACTION_TONES: Readonly<Record<string, StatusTone>> = {
    create: 'success',
    delete: 'danger',
    archive: 'neutral',
    approve: 'info',
    reject: 'warning',
};

const VIEW_ALL_LINK_CLASS = 'rounded text-xs font-bold text-accent-text hover:underline focus-ring';

/** D1: a severity-coloured score always carries its band label. */
function ScoreWithBand({ score, band, t }: { score: string | number; band: SeverityBand; t: SafeTFunction }) {
    return (
        <span className="flex shrink-0 items-center gap-2">
            <SeverityBadge band={band} label={t(`risk_levels.${band}`)} size="sm" />
            <span className={cn('font-heading text-sm font-bold tabular-nums', severityClass('text', band))}>{score}</span>
        </span>
    );
}

export function RiskCommitteeLoadingState() {
    return (
        <div className="space-y-6">
            <QuarterlyComparisonWidget />
            <LoadingState
                skeleton={(
                    <div className="grid gap-6 lg:grid-cols-3">
                        {Array(3).fill(0).map((_, i) => (
                            <div key={i} className="glass-card">
                                <Skeleton className="mb-4 h-8 w-1/3" />
                                <div className="space-y-3">
                                    {Array(3).fill(0).map((_, j) => (
                                        <Skeleton key={j} className="h-16" />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            />
        </div>
    );
}

export function RiskCommitteeErrorState({ message, t }: { message: string | null; t: SafeTFunction }) {
    return (
        <div className="space-y-6">
            <QuarterlyComparisonWidget />
            {message ? (
                <ErrorState layout="section" message={message} className="glass-card" />
            ) : (
                <EmptyState layout="section" title={t('risk_committee.no_summary_data')} className="glass-card" />
            )}
        </div>
    );
}

function CriticalRisksCard({
    summary,
    t,
}: {
    summary: DashboardCommitteeSummary;
    t: SafeTFunction;
}) {
    const { thresholds } = useRiskThresholds();

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
        >
            <Card as="section" className="h-full">
                <CardHeader
                    title={t('risk_committee.critical_risks')}
                    icon={AlertTriangle}
                    className="mb-6"
                    actions={summary.critical_risks_total > 0 ? (
                        <Link to="/risks?net_band=critical" className={VIEW_ALL_LINK_CLASS}>
                            {t('risk_committee.view_all_critical_risks', { ns: 'dashboard' })}
                        </Link>
                    ) : null}
                />

                {summary.critical_risks.length === 0 ? (
                    <EmptyState layout="section" title={t('risk_committee.no_critical_risks')} className="py-6" />
                ) : (
                    <div className="space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground">
                            {t('risk_committee.top_of_total', {
                                ns: 'dashboard',
                                shown: summary.critical_risks.length,
                                total: summary.critical_risks_total,
                            })}
                        </p>
                        {summary.critical_risks.map((risk) => (
                            <div
                                key={risk.id}
                                className="bg-tint/5 rounded-xl p-4 border border-border hover:border-border transition-colors"
                            >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-foreground leading-tight">
                                                {risk.name}
                                            </span>
                                            {risk.is_priority && (
                                                <Star aria-hidden="true" className="h-3 w-3 text-warning-text fill-warning-text shrink-0" />
                                            )}
                                        </div>
                                        <div className="text-eyebrow flex items-center gap-2">
                                            <span>{risk.process}</span>
                                        </div>
                                    </div>
                                    <ScoreWithBand score={risk.net_score} band={classifyRiskScore(risk.net_score, thresholds)} t={t} />
                                </div>
                                <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground font-medium bg-nested w-fit px-3 py-1 rounded-lg border border-border">
                                    <div className="flex items-center gap-1.5">
                                        <div aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-accent/50" />
                                        <span>{risk.owner_name}</span>
                                    </div>
                                    <span aria-hidden="true" className="w-px h-2 bg-tint/10" />
                                    <span>{risk.department_name}</span>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                                    {risk.description}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </motion.div>
    );
}

function CriticalVendorsCard({
    summary,
    t,
}: {
    summary: DashboardCommitteeSummary;
    t: SafeTFunction;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
        >
            <Card as="section" className="h-full">
                <CardHeader
                    title={t('risk_committee.high_risk_vendors', { ns: 'dashboard' })}
                    icon={Handshake}
                    className="mb-6"
                    actions={summary.can_view_vendors && (summary.critical_vendors_total ?? 0) > 0 ? (
                        <Link to="/vendors?risk_scores=4&risk_scores=5" className={VIEW_ALL_LINK_CLASS}>
                            {t('risk_committee.view_all_high_risk_vendors', { ns: 'dashboard' })}
                        </Link>
                    ) : null}
                />

                {!summary.can_view_vendors ? (
                    <p className="text-muted-foreground text-sm">
                        {t('risk_committee.restricted_by_access_scope', { ns: 'dashboard' })}
                    </p>
                ) : summary.critical_vendors.length === 0 ? (
                    <EmptyState layout="section" title={t('risk_committee.no_vendors_in_scope')} className="py-6" />
                ) : (
                    <div className="space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground">
                            {t('risk_committee.top_of_total', {
                                ns: 'dashboard',
                                shown: summary.critical_vendors.length,
                                total: summary.critical_vendors_total ?? 0,
                            })}
                        </p>
                        {summary.critical_vendors.map((v) => (
                            <Link
                                key={v.id}
                                to={buildVendorDetailPath(v.id, 'assessments', 'schedule')}
                                className="block w-full text-left bg-tint/5 rounded-xl p-4 border border-border hover:bg-tint/10 transition-colors focus-ring"
                            >
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <p className="text-sm font-bold text-foreground truncate">{v.name}</p>
                                    <ScoreWithBand score={`${v.risk_score_1_5}/5`} band={ordinalSeverityBand(v.risk_score_1_5)} t={t} />
                                </div>
                                <p className="text-eyebrow">
                                    {v.department_name} · {v.process}{v.subprocess ? ` / ${v.subprocess}` : ''}
                                </p>
                            </Link>
                        ))}
                    </div>
                )}
            </Card>
        </motion.div>
    );
}

function DepartmentExposureCard({ summary, t }: { summary: DashboardCommitteeSummary; t: SafeTFunction }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
        >
            <Card as="section" className="h-full">
                <CardHeader title={t('sections.risk_exposure_by_dept')} icon={Building2} className="mb-6" />

                {summary.department_exposure.length === 0 ? (
                    <EmptyState layout="section" title={t('risk_committee.no_department_exposure_data')} className="py-6" />
                ) : (
                    <div className="space-y-3">
                        {summary.department_exposure.map((dept, index) => {
                            const maxExposure = summary.department_exposure[0]?.total_exposure || 1;
                            const barWidth = (dept.total_exposure / maxExposure) * 100;
                            const riskCountLabel = t('risk_committee.risk_count', {
                                count: dept.risk_count,
                                ns: 'dashboard',
                            });

                            return (
                                <div
                                    key={dept.id}
                                    className="bg-tint/5 rounded-xl p-4 border border-border"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-bold text-foreground">{dept.name}</span>
                                        <span className="font-heading text-sm font-bold tabular-nums text-foreground">
                                            {dept.total_exposure}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="flex-1 h-1.5 bg-tint/5 rounded-full overflow-hidden">
                                            <motion.div
                                                aria-label={`${dept.name}: ${dept.total_exposure}; ${riskCountLabel}`}
                                                aria-valuemax={maxExposure}
                                                aria-valuemin={0}
                                                aria-valuenow={dept.total_exposure}
                                                initial={{ width: 0 }}
                                                animate={{ width: `${barWidth}%` }}
                                                transition={{ delay: 0.3 + index * 0.1, duration: 0.5 }}
                                                className="h-full bg-chart-2 rounded-full"
                                                role="progressbar"
                                            />
                                        </div>
                                    </div>
                                    <p className="text-eyebrow">
                                        {riskCountLabel}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>
        </motion.div>
    );
}

function RecentActivityCard({ summary, t }: { summary: DashboardCommitteeSummary; t: SafeTFunction }) {
    // PG-39: relative dates come from the shared locale-aware formatter.
    const format = useFormat();
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
        >
            <Card as="section" className="h-full">
                <CardHeader title={t('sections.recent_activity')} icon={Activity} className="mb-6" />

                {summary.recent_activity.length === 0 ? (
                    <EmptyState layout="section" title={t('risk_committee.no_recent_significant_activity')} className="py-6" />
                ) : (
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                        {summary.recent_activity.map((activity) => (
                            <div
                                key={activity.id}
                                className="bg-tint/5 rounded-xl p-3 border border-border"
                            >
                                <div className="flex items-start gap-2">
                                    <Badge tone={ACTION_TONES[activity.action] ?? 'neutral'} size="sm">
                                        {translateCode(t, 'risk_committee.actions', activity.action)}
                                    </Badge>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-foreground font-medium truncate">
                                            {activity.entity_name}
                                        </p>
                                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                            <Clock aria-hidden="true" className="h-3 w-3" />
                                            <time dateTime={activity.created_at}>{format.relative(activity.created_at)}</time>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </motion.div>
    );
}

export function RiskCommitteeSummaryContent({
    summary,
    t,
}: {
    summary: DashboardCommitteeSummary;
    t: SafeTFunction;
}) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
        >
            <QuarterlyComparisonWidget />

            <div className="grid gap-6 lg:grid-cols-2">
                <CriticalRisksCard summary={summary} t={t} />
                <CriticalVendorsCard summary={summary} t={t} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <DepartmentExposureCard summary={summary} t={t} />
                <RecentActivityCard summary={summary} t={t} />
            </div>
        </motion.div>
    );
}
