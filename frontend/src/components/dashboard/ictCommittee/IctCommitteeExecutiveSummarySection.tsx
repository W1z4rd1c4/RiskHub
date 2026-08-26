import { useNavigate, Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { useChartTheme } from '@/hooks/useChartTheme';
import type { IctCommitteePresentation } from '@/pages/ictRegisterCommittee/buildIctCommitteePresentation';

type ExecutivePresentation = IctCommitteePresentation['executiveSummary'];
type CellStyle = { backgroundColor: string; color: string };

interface DrilldownBarShapeProps {
    fill?: string;
    height?: number;
    payload?: { band: string; grossHref?: string; href?: string; netHref?: string };
    width?: number;
    x?: number;
    y?: number;
}

function DrilldownBarShape({
    fill = 'currentColor',
    height = 0,
    payload,
    width = 0,
    x = 0,
    y = 0,
    href,
    testIdPrefix,
}: DrilldownBarShapeProps & {
    href?: string;
    testIdPrefix: string;
}) {
    const navigate = useNavigate();
    if (!payload || !href) return null;
    return (
        <a
            href={href}
            tabIndex={0}
            data-testid={`${testIdPrefix}-${payload.band}`}
            aria-label={payload.band}
            onClick={(event) => {
                if (event.defaultPrevented || event.button !== 0) return;
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                void navigate(href);
            }}
            onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                void navigate(href);
            }}
        >
            <rect x={x} y={y} width={width} height={height} rx={6} ry={6} fill={fill} />
        </a>
    );
}

function HeatmapLegend({
    label,
    stops,
    testId,
}: {
    label: string;
    stops: Array<{ fill: string | null; label: string; value: number }>;
    testId: string;
}) {
    return (
        <div data-testid={testId} className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-xs text-slate-500 font-medium">{label}</span>
            <div className="flex items-center gap-2">
                {stops.map((stop) => (
                    <span key={stop.value} className="flex items-center gap-1">
                        <span
                            aria-hidden="true"
                            style={stop.fill ? { backgroundColor: stop.fill } : undefined}
                            className={`h-3 w-3 rounded ${stop.fill ? '' : 'bg-white/5'}`}
                        />
                        <span className="text-[10px] text-slate-500 tabular-nums">{stop.label}</span>
                    </span>
                ))}
            </div>
        </div>
    );
}

function CellPill({ value, style }: { value: string | null; style: CellStyle | null }) {
    if (!value) return <span />;
    return (
        <span
            style={style ?? undefined}
            className="inline-block px-2 py-0.5 rounded-lg text-xs font-semibold whitespace-nowrap"
        >
            {value}
        </span>
    );
}

function MatrixCell({ fill, count, testId }: { fill: string | null; count: number; testId: string }) {
    return (
        <div
            data-testid={testId}
            style={fill ? { backgroundColor: fill, color: '#0F172A' } : undefined}
            className={`h-10 min-w-10 flex items-center justify-center rounded-lg text-sm font-bold tabular-nums ${
                fill ? '' : 'bg-white/5 text-slate-500'
            }`}
        >
            {count}
        </div>
    );
}

function TopRisksTable({ presentation }: { presentation: ExecutivePresentation }) {
    const columns = presentation.topRisksColumns;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-slate-500 text-xs uppercase tracking-wide">
                        <th className="py-2 pr-3">{columns.rank}</th>
                        <th className="py-2 pr-3">{columns.id}</th>
                        <th className="py-2 pr-3">{columns.subject}</th>
                        <th className="py-2 pr-3">{columns.threat}</th>
                        <th className="py-2 pr-3 text-right">{columns.gross}</th>
                        <th className="py-2 pr-3 text-right">{columns.net}</th>
                        <th className="py-2 pr-3">{columns.band}</th>
                        <th className="py-2 pr-3">{columns.tolerance}</th>
                        <th className="py-2">{columns.status}</th>
                    </tr>
                </thead>
                <tbody>
                    {presentation.topRisks.map((risk) => (
                        <tr key={risk.rank} data-testid={`committee-top-risk-${risk.rank}`} className="border-t border-white/5">
                            <td className="py-2 pr-3 text-slate-500 font-bold">{risk.rank}</td>
                            <td className="py-2 pr-3">
                                <Link
                                    to={risk.href}
                                    className="text-slate-200 font-semibold hover:text-accent underline decoration-white/20 hover:decoration-accent"
                                >
                                    {risk.label}
                                </Link>
                            </td>
                            <td className="py-2 pr-3 text-slate-300">{risk.subjectLabel}</td>
                            <td className="py-2 pr-3 text-slate-300">{risk.threatLabel}</td>
                            <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{risk.grossScore}</td>
                            <td className="py-2 pr-3 text-right tabular-nums font-bold text-white">{risk.netScore}</td>
                            <td className="py-2 pr-3">
                                <CellPill value={risk.netBand} style={risk.netBandStyle} />
                            </td>
                            <td className="py-2 pr-3">
                                <CellPill value={risk.tolerance} style={risk.toleranceStyle} />
                            </td>
                            <td className="py-2 text-slate-300">{risk.statusLabel}</td>
                        </tr>
                    ))}
                    {presentation.emptyRiskRanks.map((rank) => (
                        <tr key={rank} data-testid={`committee-top-risk-empty-${rank}`} className="border-t border-white/5">
                            <td className="py-2 pr-3 text-slate-600 font-bold">{rank}</td>
                            <td className="py-2 text-slate-600" colSpan={8} aria-hidden="true" />
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function TopVendorsTable({ presentation }: { presentation: ExecutivePresentation }) {
    const columns = presentation.topVendorsColumns;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-slate-500 text-xs uppercase tracking-wide">
                        <th className="py-2 pr-3">{columns.rank}</th>
                        <th className="py-2 pr-3">{columns.vendor}</th>
                        <th className="py-2 pr-3 text-right">{columns.cifProcesses}</th>
                        <th className="py-2">{columns.tier}</th>
                    </tr>
                </thead>
                <tbody>
                    {presentation.topVendors.map((vendor) => (
                        <tr key={vendor.rank} data-testid={`committee-top-vendor-${vendor.rank}`} className="border-t border-white/5">
                            <td className="py-2 pr-3 text-slate-500 font-bold">{vendor.rank}</td>
                            <td className="py-2 pr-3">
                                <Link
                                    to={vendor.href}
                                    className="text-slate-200 font-semibold hover:text-accent underline decoration-white/20 hover:decoration-accent"
                                >
                                    {vendor.name}
                                </Link>
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums font-bold text-white">
                                {vendor.cifProcessCount}
                            </td>
                            <td className="py-2">
                                <CellPill value={vendor.tier} style={vendor.tierStyle} />
                            </td>
                        </tr>
                    ))}
                    {presentation.emptyVendorRanks.map((rank) => (
                        <tr key={rank} data-testid={`committee-top-vendor-empty-${rank}`} className="border-t border-white/5">
                            <td className="py-2 pr-3 text-slate-600 font-bold">{rank}</td>
                            <td className="py-2 text-slate-600" colSpan={3} aria-hidden="true" />
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function IctCommitteeExecutiveSummarySection({ presentation }: { presentation: ExecutivePresentation }) {
    const chartTheme = useChartTheme();

    return (
        <section id="cro" className="space-y-4" data-testid="committee-cro">
            <h2 className="text-xl font-bold text-white">{presentation.title}</h2>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                {presentation.kpis.map((kpi) => {
                    const content = (
                        <div data-testid={`committee-kpi-${kpi.key}`} title={kpi.inertHint ?? undefined}>
                            <p className="text-slate-500 text-xs font-bold text-center min-h-8">{kpi.label}</p>
                            {kpi.inert ? (
                                <>
                                    <p className="text-3xl font-bold text-slate-600 text-center mt-1">{kpi.displayValue}</p>
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 text-center mt-1">
                                        {kpi.inertLabel}
                                    </p>
                                </>
                            ) : (
                                <p className={`text-3xl font-bold text-center mt-1 tabular-nums ${kpi.countClass}`}>
                                    {kpi.displayValue}
                                </p>
                            )}
                        </div>
                    );
                    return kpi.href ? (
                        <Link key={kpi.key} to={kpi.href} className="glass-card block hover:bg-white/5 transition-colors">
                            {content}
                        </Link>
                    ) : (
                        <div key={kpi.key} className="glass-card block cursor-default" aria-disabled="true">
                            {content}
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="glass-card" data-testid="committee-heatmap">
                    <h3 className="text-white font-bold">{presentation.heatmap.title}</h3>
                    <p className="text-slate-500 text-xs font-medium mt-1">{presentation.heatmap.axis}</p>
                    <div className="mt-3 space-y-1.5 overflow-x-auto">
                        {presentation.heatmap.rows.map((row) => (
                            <div key={row.probability} className="flex items-center gap-1.5">
                                <span className="w-5 text-right text-xs text-slate-500 font-bold">{row.probability}</span>
                                <div className="grid grid-cols-5 gap-1.5 flex-1">
                                    {row.cells.map((cell) => (
                                        <Link
                                            key={cell.column}
                                            to={cell.href}
                                            data-testid={`committee-heatmap-link-${row.probability}-${cell.column}`}
                                            className="block"
                                        >
                                            <MatrixCell
                                                fill={cell.fill}
                                                count={cell.count}
                                                testId={`committee-heatmap-cell-${row.probability}-${cell.column}`}
                                            />
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        ))}
                        <div className="flex items-center gap-1.5">
                            <span className="w-5" />
                            <div className="grid grid-cols-5 gap-1.5 flex-1">
                                {presentation.heatmap.columns.map((value) => (
                                    <span key={value} className="text-center text-xs text-slate-500 font-bold">{value}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                    <HeatmapLegend
                        label={presentation.heatmap.legend}
                        stops={presentation.heatmap.legendStops}
                        testId="committee-heatmap-legend"
                    />
                </div>

                <div className="glass-card" data-testid="committee-migration">
                    <h3 className="text-white font-bold">{presentation.migration.title}</h3>
                    <p className="text-slate-500 text-xs font-medium mt-1">{presentation.migration.axis}</p>
                    <div className="mt-3 space-y-1.5 overflow-x-auto">
                        {presentation.migration.rows.map((row) => (
                            <div key={row.grossBand} className="flex items-center gap-1.5">
                                <span className="w-16 text-right text-xs text-slate-500 font-bold">{row.grossBand}</span>
                                <div className="grid grid-cols-4 gap-1.5 flex-1">
                                    {row.cells.map((cell) => (
                                        <Link
                                            key={cell.band}
                                            to={cell.href}
                                            data-testid={`committee-migration-link-${row.grossBand}-${cell.band}`}
                                            className="block"
                                        >
                                            <MatrixCell
                                                fill={cell.fill}
                                                count={cell.count}
                                                testId={`committee-migration-cell-${row.grossBand}-${cell.band}`}
                                            />
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        ))}
                        <div className="flex items-center gap-1.5">
                            <span className="w-16" />
                            <div className="grid grid-cols-4 gap-1.5 flex-1">
                                {presentation.migration.columns.map((band) => (
                                    <span key={band} className="text-center text-xs text-slate-500 font-bold">{band}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                    <HeatmapLegend
                        label={presentation.migration.legend}
                        stops={presentation.migration.legendStops}
                        testId="committee-migration-legend"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="glass-card">
                    <h3 className="text-white font-bold mb-3">{presentation.topRisksTitle}</h3>
                    <TopRisksTable presentation={presentation} />
                </div>
                <div className="glass-card">
                    <h3 className="text-white font-bold mb-3">{presentation.topVendorsTitle}</h3>
                    <TopVendorsTable presentation={presentation} />
                </div>
            </div>

            <div className="glass-card space-y-2" data-testid="committee-narratives">
                <h3 className="text-white font-bold">{presentation.narrativesTitle}</h3>
                {presentation.narratives.map((narrative) => (
                    <p
                        key={narrative.key}
                        data-testid={`committee-narrative-${narrative.key}`}
                        className={narrative.className}
                    >
                        {narrative.text}
                    </p>
                ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="glass-card" data-testid="committee-chart-assets">
                    <h3 className="text-white font-bold mb-3">{presentation.assetChartTitle}</h3>
                    <ResponsiveContainer width="100%" height={240} initialDimension={{ width: 1, height: 240 }}>
                        <BarChart data={presentation.assetChart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                            <XAxis
                                dataKey="band"
                                tick={{ fill: chartTheme.axisTickFill, fontSize: 11, fontWeight: 600 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                allowDecimals={false}
                                tick={{ fill: chartTheme.axisTickFill, fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: chartTheme.tooltipBackground,
                                    border: `1px solid ${chartTheme.tooltipBorder}`,
                                    borderRadius: '12px',
                                }}
                                itemStyle={{ color: chartTheme.tooltipTextPrimary }}
                                cursor={{ fill: 'transparent' }}
                            />
                            <Bar
                                dataKey="count"
                                fill={chartTheme.series.primary}
                                shape={(props: DrilldownBarShapeProps) => (
                                    <DrilldownBarShape
                                        {...props}
                                        href={props.payload?.href}
                                        testIdPrefix="committee-asset-bar-shape"
                                    />
                                )}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        {presentation.assetChart.filter((entry) => entry.count > 0).map((entry) => (
                            <Link
                                key={entry.band}
                                to={entry.href}
                                data-testid={`committee-asset-bar-${entry.band}`}
                                className="rounded-lg bg-white/5 px-2 py-1 text-xs text-slate-300 hover:text-accent"
                            >
                                {entry.band}: {entry.count}
                            </Link>
                        ))}
                    </div>
                </div>

                <div className="glass-card" data-testid="committee-chart-risk-bands">
                    <h3 className="text-white font-bold mb-3">{presentation.riskBandChartTitle}</h3>
                    <ResponsiveContainer width="100%" height={240} initialDimension={{ width: 1, height: 240 }}>
                        <BarChart data={presentation.riskBandChart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                            <XAxis
                                dataKey="band"
                                tick={{ fill: chartTheme.axisTickFill, fontSize: 11, fontWeight: 600 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                allowDecimals={false}
                                tick={{ fill: chartTheme.axisTickFill, fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: chartTheme.tooltipBackground,
                                    border: `1px solid ${chartTheme.tooltipBorder}`,
                                    borderRadius: '12px',
                                }}
                                itemStyle={{ color: chartTheme.tooltipTextPrimary }}
                                cursor={{ fill: 'transparent' }}
                            />
                            <Legend />
                            <Bar
                                dataKey="gross"
                                name={presentation.riskBandChartLabels.gross}
                                fill={chartTheme.series.neutral}
                                shape={(props: DrilldownBarShapeProps) => (
                                    <DrilldownBarShape
                                        {...props}
                                        href={props.payload?.grossHref}
                                        testIdPrefix="committee-risk-bar-shape-gross"
                                    />
                                )}
                            />
                            <Bar
                                dataKey="net"
                                name={presentation.riskBandChartLabels.net}
                                fill={chartTheme.series.primary}
                                shape={(props: DrilldownBarShapeProps) => (
                                    <DrilldownBarShape
                                        {...props}
                                        href={props.payload?.netHref}
                                        testIdPrefix="committee-risk-bar-shape-net"
                                    />
                                )}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        {presentation.riskBandChart.flatMap((entry) =>
                            (['gross', 'net'] as const)
                                .filter((score) => entry[score] > 0)
                                .map((score) => (
                                    <Link
                                        key={`${entry.band}-${score}`}
                                        to={score === 'gross' ? entry.grossHref : entry.netHref}
                                        data-testid={`committee-risk-bar-${score}-${entry.band}`}
                                        className="rounded-lg bg-white/5 px-2 py-1 text-xs text-slate-300 hover:text-accent"
                                    >
                                        {entry.band} · {presentation.riskBandChartLabels[score]}: {entry[score]}
                                    </Link>
                                )),
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
