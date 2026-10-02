import { Link } from 'react-router-dom';

import { CardTitle } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

import type { IctCommitteePresentation } from '@/pages/ictRegisterCommittee/buildIctCommitteePresentation';

type DashboardPresentation = IctCommitteePresentation['dashboard'];

export function IctCommitteeDashboardSection({ presentation }: { presentation: DashboardPresentation }) {
    return (
        <section className="space-y-4" data-testid="committee-dashboard">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <CardTitle as="h2">{presentation.title}</CardTitle>
                <div className="flex gap-4 text-sm font-semibold">
                    <Link
                        to={presentation.navigation.dqHref}
                        data-testid="committee-nav-dq"
                        className="rounded text-muted-foreground hover:text-accent-text transition-colors focus-ring"
                    >
                        {presentation.navigation.dqLabel}
                    </Link>
                    <a
                        href={presentation.navigation.croHref}
                        data-testid="committee-nav-cro"
                        className="rounded text-muted-foreground hover:text-accent-text transition-colors focus-ring"
                    >
                        {presentation.navigation.croLabel}
                    </a>
                </div>
            </div>

            <h3 className="text-eyebrow">
                {presentation.stateHeading}
            </h3>
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(10rem,1fr))]">
                {presentation.stateTiles.map((tile) => (
                    <Link key={tile.key} to={tile.href} className="glass-card block hover:bg-tint/5 transition-colors focus-ring">
                        <div data-testid={`committee-state-${tile.key}`}>
                            <p className="text-muted-foreground text-xs font-medium min-h-8">{tile.label}</p>
                            <p className={`text-2xl font-bold mt-1 tabular-nums ${tile.countClass}`}>
                                {tile.value}
                            </p>
                        </div>
                    </Link>
                ))}
            </div>

            <h3 className="text-eyebrow">
                {presentation.metricsHeading}
            </h3>
            <div className="glass-card">
                <Table density="compact" className="text-sm" regionLabel={presentation.metricsHeading}>
                    <THead>
                        <TR>
                            <TH>{presentation.metricsColumns.metric}</TH>
                            <TH align="right">{presentation.metricsColumns.value}</TH>
                            <TH>{presentation.metricsColumns.interpretation}</TH>
                            <TH>{presentation.metricsColumns.source}</TH>
                            <TH>{presentation.metricsColumns.action}</TH>
                        </TR>
                    </THead>
                    <TBody>
                        {presentation.metrics.map((metric) => (
                            <TR key={metric.key} data-testid={`committee-metric-${metric.key}`}>
                                <TD className="text-foreground font-semibold">{metric.label}</TD>
                                <TD align="right">
                                    <Link
                                        to={metric.href}
                                        aria-label={`${metric.label}: ${metric.value}`}
                                        className={`rounded text-lg font-bold tabular-nums hover:text-accent-text underline decoration-tint/20 hover:decoration-accent focus-ring ${metric.countClass}`}
                                    >
                                        {metric.value}
                                    </Link>
                                </TD>
                                <TD className="text-muted-foreground">{metric.interpretation}</TD>
                                <TD>
                                    <Link
                                        to={metric.href}
                                        className="rounded text-muted-foreground hover:text-accent-text underline decoration-tint/20 hover:decoration-accent focus-ring"
                                    >
                                        {metric.source}
                                    </Link>
                                </TD>
                                <TD className="text-muted-foreground">{metric.action}</TD>
                            </TR>
                        ))}
                    </TBody>
                </Table>
            </div>
        </section>
    );
}
