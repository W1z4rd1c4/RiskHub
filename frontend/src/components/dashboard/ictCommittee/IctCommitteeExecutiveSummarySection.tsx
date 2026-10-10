import { useNavigate, Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { getChartTooltipProps } from '@/components/dashboard/chartTooltip';
import { CardTitle } from '@/components/ui/card';
import { ChartFrame } from '@/components/ui/ChartFrame';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useChartTheme } from '@/hooks/useChartTheme';
import { cn } from '@/lib/utils';
import type { IctCommitteePresentation } from '@/pages/ictRegisterCommittee/buildIctCommitteePresentation';

type ExecutivePresentation = IctCommitteePresentation['executiveSummary'];

interface DrilldownBarShapeProps {
    fill?: string;
    height?: number;
    payload?: {
        band: string;
        count?: number;
        gross?: number;
        grossHref?: string;
        href?: string;
        label?: string;
        net?: number;
        netHref?: string;
    };
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
    ariaLabel,
    testIdPrefix,
}: DrilldownBarShapeProps & {
    href?: string;
    /** Accessible name of the bar link: category, series and value. */
    ariaLabel?: string;
    testIdPrefix: string;
}) {
    const navigate = useNavigate();
    if (!payload || !href) return null;
    return (
        <a
            href={href}
            tabIndex={0}
            data-testid={`${testIdPrefix}-${payload.band}`}
            aria-label={ariaLabel ?? payload.label ?? payload.band}
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
    stops: Array<{ heatClass: string; label: string; value: number }>;
    testId: string;
}) {
    return (
        <div data-testid={testId} className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-xs text-muted-foreground font-medium">{label}</span>
            <div className="flex items-center gap-2">
                {stops.map((stop) => (
                    <span key={stop.value} className="flex items-center gap-1">
                        <span aria-hidden="true" className={cn('h-3 w-3 rounded border border-border', stop.heatClass)} />
                        <span className="text-xs text-muted-foreground tabular-nums">{stop.label}</span>
                    </span>
                ))}
            </div>
        </div>
    );
}

/** Workbook status pill on the `Badge` md geometry; the colour recipe comes from the presentation (lib/severity). */
function CellPill({ value, toneClassName }: { value: string | null; toneClassName: string | null }) {
    if (!value) return <span />;
    return (
        <span
            className={cn(
                'inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold',
                toneClassName ?? 'bg-muted text-muted-foreground',
            )}
        >
            {value}
        </span>
    );
}

function MatrixCell({ heatClass, count, testId }: { heatClass: string; count: number; testId: string }) {
    return (
        <div
            data-testid={testId}
            className={cn('h-10 min-w-10 flex items-center justify-center rounded-lg text-sm font-bold tabular-nums', heatClass)}
        >
            {count}
        </div>
    );
}

const TABLE_LINK_CLASS = 'rounded text-foreground font-semibold hover:text-accent-text underline decoration-tint/20 hover:decoration-accent focus-ring';

function TopRisksTable({ presentation }: { presentation: ExecutivePresentation }) {
    const columns = presentation.topRisksColumns;
    return (
        <Table density="compact" className="text-sm" regionLabel={presentation.topRisksTitle}>
            <THead>
                <TR>
                    <TH>{columns.rank}</TH>
                    <TH>{columns.id}</TH>
                    <TH>{columns.subject}</TH>
                    <TH>{columns.threat}</TH>
                    <TH align="right">{columns.gross}</TH>
                    <TH align="right">{columns.net}</TH>
                    <TH>{columns.band}</TH>
                    <TH>{columns.tolerance}</TH>
                    <TH>{columns.status}</TH>
                </TR>
            </THead>
            <TBody>
                {presentation.topRisks.map((risk) => (
                    <TR key={risk.rank} data-testid={`committee-top-risk-${risk.rank}`}>
                        <TD className="text-muted-foreground font-bold">{risk.rank}</TD>
                        <TD>
                            <Link to={risk.href} className={TABLE_LINK_CLASS}>
                                {risk.label}
                            </Link>
                        </TD>
                        <TD className="text-foreground">{risk.subjectLabel}</TD>
                        <TD className="text-foreground">{risk.threatLabel}</TD>
                        <TD align="right" className="tabular-nums text-foreground">{risk.grossScore}</TD>
                        <TD align="right" className="tabular-nums font-bold text-foreground">{risk.netScore}</TD>
                        <TD>
                            <CellPill value={risk.netBand} toneClassName={risk.netBandClass} />
                        </TD>
                        <TD>
                            <CellPill value={risk.tolerance} toneClassName={risk.toleranceClass} />
                        </TD>
                        <TD className="text-foreground">{risk.statusLabel}</TD>
                    </TR>
                ))}
                {presentation.emptyRiskRanks.map((rank) => (
                    <TR key={rank} data-testid={`committee-top-risk-empty-${rank}`}>
                        <TD className="text-muted-foreground font-bold">{rank}</TD>
                        <TD className="text-muted-foreground" colSpan={8} aria-hidden="true" />
                    </TR>
                ))}
            </TBody>
        </Table>
    );
}

function TopVendorsTable({ presentation }: { presentation: ExecutivePresentation }) {
    const columns = presentation.topVendorsColumns;
    return (
        <Table density="compact" className="text-sm" regionLabel={presentation.topVendorsTitle}>
            <THead>
                <TR>
                    <TH>{columns.rank}</TH>
                    <TH>{columns.vendor}</TH>
                    <TH align="right">{columns.cifProcesses}</TH>
                    <TH>{columns.tier}</TH>
                </TR>
            </THead>
            <TBody>
                {presentation.topVendors.map((vendor) => (
                    <TR key={vendor.rank} data-testid={`committee-top-vendor-${vendor.rank}`}>
                        <TD className="text-muted-foreground font-bold">{vendor.rank}</TD>
                        <TD>
                            <Link to={vendor.href} className={TABLE_LINK_CLASS}>
                                {vendor.name}
                            </Link>
                        </TD>
                        <TD align="right" className="tabular-nums font-bold text-foreground">
                            {vendor.cifProcessCount}
                        </TD>
                        <TD>
                            <CellPill value={vendor.tier} toneClassName={vendor.tierClass} />
                        </TD>
                    </TR>
                ))}
                {presentation.emptyVendorRanks.map((rank) => (
                    <TR key={rank} data-testid={`committee-top-vendor-empty-${rank}`}>
                        <TD className="text-muted-foreground font-bold">{rank}</TD>
                        <TD className="text-muted-foreground" colSpan={3} aria-hidden="true" />
                    </TR>
                ))}
            </TBody>
        </Table>
    );
}

export function IctCommitteeExecutiveSummarySection({ presentation }: { presentation: ExecutivePresentation }) {
    const chartTheme = useChartTheme();
    const tooltipProps = getChartTooltipProps(chartTheme);

    return (
        <section id="cro" className="space-y-4" data-testid="committee-cro">
            <CardTitle as="h2">{presentation.title}</CardTitle>

            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(10rem,1fr))]">
                {presentation.kpis.map((kpi) => {
                    const content = (
                        <div data-testid={`committee-kpi-${kpi.key}`}>
                            <p className="text-muted-foreground text-xs font-bold text-center min-h-8">{kpi.label}</p>
                            {kpi.inert ? (
                                <>
                                    <p className="text-3xl font-bold text-muted-foreground text-center mt-1">{kpi.displayValue}</p>
                                    <p className="text-eyebrow text-center mt-1">
                                        {kpi.inertLabel}
                                    </p>
                                    {/* GAP-B-19: the reason is visible help text, not a `title` tooltip. */}
                                    {kpi.inertHint ? (
                                        <p className="mt-1 text-center text-xs text-muted-foreground">{kpi.inertHint}</p>
                                    ) : null}
                                </>
                            ) : (
                                <p className={`text-3xl font-bold text-center mt-1 tabular-nums ${kpi.countClass}`}>
                                    {kpi.displayValue}
                                </p>
                            )}
                        </div>
                    );
                    return kpi.href ? (
                        <Link key={kpi.key} to={kpi.href} className="glass-card block hover:bg-tint/5 transition-colors">
                            {content}
                        </Link>
                    ) : (
                        <div key={kpi.key} className="glass-card block">
                            {content}
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="glass-card" data-testid="committee-heatmap">
                    <CardTitle as="h3">{presentation.heatmap.title}</CardTitle>
                    <p className="text-muted-foreground text-xs font-medium mt-1">{presentation.heatmap.axis}</p>
                    <div className="mt-3 space-y-1.5 overflow-x-auto">
                        {presentation.heatmap.rows.map((row) => (
                            <div key={row.probability} className="flex items-center gap-1.5">
                                <span className="w-5 text-right text-xs text-muted-foreground font-bold">{row.probability}</span>
                                <div className="grid grid-cols-5 gap-1.5 flex-1">
                                    {row.cells.map((cell) => (
                                        <Link
                                            key={cell.column}
                                            to={cell.href}
                                            data-testid={`committee-heatmap-link-${row.probability}-${cell.column}`}
                                            aria-label={cell.ariaLabel}
                                            className="block"
                                        >
                                            <MatrixCell
                                                heatClass={cell.heatClass}
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
                                    <span key={value} className="text-center text-xs text-muted-foreground font-bold">{value}</span>
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
                    <CardTitle as="h3">{presentation.migration.title}</CardTitle>
                    <p className="text-muted-foreground text-xs font-medium mt-1">{presentation.migration.axis}</p>
                    <div className="mt-3 space-y-1.5 overflow-x-auto">
                        {presentation.migration.rows.map((row) => (
                            <div key={row.grossBand} className="flex items-center gap-1.5">
                                <span className="w-16 text-right text-xs text-muted-foreground font-bold">{row.grossBandLabel}</span>
                                <div className="grid grid-cols-4 gap-1.5 flex-1">
                                    {row.cells.map((cell) => (
                                        <Link
                                            key={cell.band}
                                            to={cell.href}
                                            data-testid={`committee-migration-link-${row.grossBand}-${cell.band}`}
                                            aria-label={cell.ariaLabel}
                                            className="block"
                                        >
                                            <MatrixCell
                                                heatClass={cell.heatClass}
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
                                {presentation.migration.columns.map((band, index) => (
                                    <span key={band} className="text-center text-xs text-muted-foreground font-bold">
                                        {presentation.migration.columnLabels[index]}
                                    </span>
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
                    <CardTitle as="h3" className="mb-3">{presentation.topRisksTitle}</CardTitle>
                    <TopRisksTable presentation={presentation} />
                </div>
                <div className="glass-card">
                    <CardTitle as="h3" className="mb-3">{presentation.topVendorsTitle}</CardTitle>
                    <TopVendorsTable presentation={presentation} />
                </div>
            </div>

            <div className="glass-card space-y-2" data-testid="committee-narratives">
                <CardTitle as="h3">{presentation.narrativesTitle}</CardTitle>
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
                    <CardTitle as="h3" className="mb-3">{presentation.assetChartTitle}</CardTitle>
                    <ChartFrame
                        summary={presentation.assetChartSummary}
                        table={{
                            columns: [presentation.assetChartColumns.band, presentation.assetChartColumns.count],
                            rows: presentation.assetChart.map((entry) => ({
                                key: entry.band,
                                header: entry.label,
                                cells: [entry.count],
                            })),
                        }}
                    >
                        <ResponsiveContainer width="100%" height={240} initialDimension={{ width: 1, height: 240 }}>
                            <BarChart data={presentation.assetChart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                                <XAxis
                                    dataKey="label"
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
                                <Tooltip {...tooltipProps} cursor={{ fill: 'transparent' }} />
                                <Bar
                                    dataKey="count"
                                    name={presentation.assetChartColumns.count}
                                    fill={chartTheme.series.primary}
                                    shape={(props: DrilldownBarShapeProps) => (
                                        <DrilldownBarShape
                                            {...props}
                                            href={props.payload?.href}
                                            ariaLabel={`${props.payload?.label ?? props.payload?.band ?? ''}: ${props.payload?.count ?? 0}`}
                                            testIdPrefix="committee-asset-bar-shape"
                                        />
                                    )}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartFrame>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        {presentation.assetChart.filter((entry) => entry.count > 0).map((entry) => (
                            <Link
                                key={entry.band}
                                to={entry.href}
                                data-testid={`committee-asset-bar-${entry.band}`}
                                className="rounded-lg bg-tint/5 px-3 py-1.5 text-xs text-foreground hover:text-accent-text focus-ring"
                            >
                                {entry.label}: {entry.count}
                            </Link>
                        ))}
                    </div>
                </div>

                <div className="glass-card" data-testid="committee-chart-risk-bands">
                    <CardTitle as="h3" className="mb-3">{presentation.riskBandChartTitle}</CardTitle>
                    <ChartFrame
                        summary={presentation.riskBandChartSummary}
                        legend={[
                            { key: 'gross', label: presentation.riskBandChartLabels.gross, color: chartTheme.series.neutral },
                            { key: 'net', label: presentation.riskBandChartLabels.net, color: chartTheme.series.primary },
                        ]}
                        table={{
                            columns: [
                                presentation.riskBandChartBandColumn,
                                presentation.riskBandChartLabels.gross,
                                presentation.riskBandChartLabels.net,
                            ],
                            rows: presentation.riskBandChart.map((entry) => ({
                                key: entry.band,
                                header: entry.label,
                                cells: [entry.gross, entry.net],
                            })),
                        }}
                    >
                        <ResponsiveContainer width="100%" height={240} initialDimension={{ width: 1, height: 240 }}>
                            <BarChart data={presentation.riskBandChart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                                <XAxis
                                    dataKey="label"
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
                                <Tooltip {...tooltipProps} cursor={{ fill: 'transparent' }} />
                                <Bar
                                    dataKey="gross"
                                    name={presentation.riskBandChartLabels.gross}
                                    fill={chartTheme.series.neutral}
                                    shape={(props: DrilldownBarShapeProps) => (
                                        <DrilldownBarShape
                                            {...props}
                                            href={props.payload?.grossHref}
                                            ariaLabel={`${props.payload?.label ?? props.payload?.band ?? ''} · ${presentation.riskBandChartLabels.gross}: ${props.payload?.gross ?? 0}`}
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
                                            ariaLabel={`${props.payload?.label ?? props.payload?.band ?? ''} · ${presentation.riskBandChartLabels.net}: ${props.payload?.net ?? 0}`}
                                            testIdPrefix="committee-risk-bar-shape-net"
                                        />
                                    )}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartFrame>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        {presentation.riskBandChart.flatMap((entry) =>
                            (['gross', 'net'] as const)
                                .filter((score) => entry[score] > 0)
                                .map((score) => (
                                    <Link
                                        key={`${entry.band}-${score}`}
                                        to={score === 'gross' ? entry.grossHref : entry.netHref}
                                        data-testid={`committee-risk-bar-${score}-${entry.band}`}
                                        className="rounded-lg bg-tint/5 px-3 py-1.5 text-xs text-foreground hover:text-accent-text focus-ring"
                                    >
                                        {entry.label} · {presentation.riskBandChartLabels[score]}: {entry[score]}
                                    </Link>
                                )),
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
