import { Link } from 'react-router-dom';

import type { IctCommitteePresentation } from '@/pages/ictRegisterCommittee/buildIctCommitteePresentation';

type DashboardPresentation = IctCommitteePresentation['dashboard'];

export function IctCommitteeDashboardSection({ presentation }: { presentation: DashboardPresentation }) {
    return (
        <section className="space-y-4" data-testid="committee-dashboard">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <h2 className="text-xl font-bold text-white">{presentation.title}</h2>
                <div className="flex gap-4 text-sm font-semibold">
                    <Link
                        to={presentation.navigation.dqHref}
                        data-testid="committee-nav-dq"
                        className="text-slate-400 hover:text-accent transition-colors"
                    >
                        {presentation.navigation.dqLabel}
                    </Link>
                    <a
                        href={presentation.navigation.croHref}
                        data-testid="committee-nav-cro"
                        className="text-slate-400 hover:text-accent transition-colors"
                    >
                        {presentation.navigation.croLabel}
                    </a>
                </div>
            </div>

            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                {presentation.stateHeading}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {presentation.stateTiles.map((tile) => (
                    <Link key={tile.key} to={tile.href} className="glass-card block hover:bg-white/5 transition-colors">
                        <div data-testid={`committee-state-${tile.key}`}>
                            <p className="text-muted-foreground text-xs font-medium min-h-8">{tile.label}</p>
                            <p className={`text-2xl font-bold mt-1 tabular-nums ${tile.countClass}`}>
                                {tile.value}
                            </p>
                        </div>
                    </Link>
                ))}
            </div>

            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                {presentation.metricsHeading}
            </h3>
            <div className="glass-card overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-muted-foreground text-xs uppercase tracking-wide">
                            <th className="py-2 pr-3">{presentation.metricsColumns.metric}</th>
                            <th className="py-2 pr-3 text-right">{presentation.metricsColumns.value}</th>
                            <th className="py-2 pr-3">{presentation.metricsColumns.interpretation}</th>
                            <th className="py-2 pr-3">{presentation.metricsColumns.source}</th>
                            <th className="py-2">{presentation.metricsColumns.action}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {presentation.metrics.map((metric) => (
                            <tr
                                key={metric.key}
                                data-testid={`committee-metric-${metric.key}`}
                                className="border-t border-white/5"
                            >
                                <td className="py-2.5 pr-3 text-slate-200 font-semibold">{metric.label}</td>
                                <td className="py-2.5 pr-3 text-right">
                                    <Link
                                        to={metric.href}
                                        className={`text-lg font-bold tabular-nums hover:text-accent underline decoration-white/20 hover:decoration-accent ${metric.countClass}`}
                                    >
                                        {metric.value}
                                    </Link>
                                </td>
                                <td className="py-2.5 pr-3 text-slate-400">{metric.interpretation}</td>
                                <td className="py-2.5 pr-3">
                                    <Link
                                        to={metric.href}
                                        className="text-slate-400 hover:text-accent underline decoration-white/20 hover:decoration-accent"
                                    >
                                        {metric.source}
                                    </Link>
                                </td>
                                <td className="py-2.5 text-slate-400">{metric.action}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
