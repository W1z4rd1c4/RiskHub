import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { RefreshCw } from 'lucide-react';

import { TableErrorState, useTableErrorContract } from '@/components/tables/tableError';
import { useChartTheme } from '@/hooks/useChartTheme';
import { useTranslation } from '@/i18n/hooks';
import { apiClient, isForbiddenApiError } from '@/services/apiClient';
import { ictRegisterCommitteeApi } from '@/services/ictRegisterCommitteeApi';
import type {
    IctCommittee,
    IctCommitteeKeyMetrics,
    IctCommitteeRegisterState,
    IctCommitteeTopRisk,
    IctCommitteeTopVendor,
    IctRoiReadiness,
    IctRoiTemplateReadiness,
} from '@/types/ictRegisterCommittee';

import {
    HEATMAP_SUBJECT_VALUES,
    heatmapCellFill,
    kpiDrilldownPath,
    localizeRegisterRowLabel,
    metricDrilldownPath,
    migrationCellFill,
    narrativeParams,
    netBandStyle,
    riskBandChartRows,
    roiGapRoutePath,
    stateTileDrilldownPath,
    tierStyle,
    toleranceStyle,
    topRiskPath,
    topVendorPath,
} from '@/pages/ictRegisterCommittee/committeePresentation';
import { ReadAccessDeniedState } from '@/pages/shared/ReadAccessDeniedState';

// 16_Dashboard §1.1 tile order (inventory rows 7-16).
const STATE_TILE_KEYS: (keyof IctCommitteeRegisterState)[] = [
    'process_count',
    'asset_count',
    'process_asset_link_count',
    'vendor_count',
    'assets_pending_review_count',
    'direct_process_vendor_link_count',
    'contracts_in_roi_scope_count',
    'sub_outsourcing_link_count',
    'assets_without_data_classification_count',
    'top_tier_vendors_without_orderly_exit_count',
];

// 16_Dashboard §1.2 metric-row order (inventory rows 19-24).
const METRIC_KEYS: (keyof IctCommitteeKeyMetrics)[] = [
    'cif_process_count',
    'processes_without_impact_assessment_count',
    'critical_asset_count',
    'critical_vendor_count',
    'risks_above_tolerance_count',
    'open_dq_finding_count',
];

// 18_CRO_přehled §2.1 KPI order (cells A7-K7).
const KPI_KEYS = [
    'risk_count',
    'material_risk_count',
    'risks_above_tolerance_count',
    'accepted_above_tolerance_count',
    'cif_without_bcm_count',
    'open_dq_finding_count',
] as const;

const NET_BANDS = ['Nízké', 'Střední', 'Vysoké', 'Kritické'];

// FR-P5-6 (S1): the "blocking" tiles/metrics/KPIs are deficiency counts — gaps
// that block DORA readiness ("…without…", "pending review", "above tolerance",
// "open findings"), classified from the tile inventory §1.1 / §1.2 / §2.1. They
// must not read as the same neutral `text-white` as pure inventory (register
// sizes): a non-zero backlog reads amber (needs attention), a cleared zero reads
// emerald. The descriptive tile label carries the meaning so colour is never the
// sole signal.
const BLOCKING_STATE_KEYS = new Set<keyof IctCommitteeRegisterState>([
    'assets_pending_review_count',
    'assets_without_data_classification_count',
    'top_tier_vendors_without_orderly_exit_count',
]);
const BLOCKING_METRIC_KEYS = new Set<keyof IctCommitteeKeyMetrics>([
    'processes_without_impact_assessment_count',
    'risks_above_tolerance_count',
    'open_dq_finding_count',
]);
const BLOCKING_KPI_KEYS = new Set<string>([
    'risks_above_tolerance_count',
    'accepted_above_tolerance_count',
    'cif_without_bcm_count',
    'open_dq_finding_count',
]);

function blockingCountClass(value: number): string {
    return value > 0 ? 'text-amber-300' : 'text-emerald-400';
}

// FR-P5-7 (P10): the RoI per-template readiness bar gets a colour threshold so a
// glance separates ready (≥ 80 %) from partial (≥ 50 %) from at-risk (< 50 %).
function roiReadinessBarClass(pct: number | null): string {
    if (pct === null) return 'bg-slate-500';
    if (pct >= 80) return 'bg-emerald-500';
    if (pct >= 50) return 'bg-amber-500';
    return 'bg-rose-500';
}

// FR-P5-7 (P10): a legend for the two magnitude heatmaps — swatches sampled from
// the same ColorScale the cells use (`heatmapCellFill` / `migrationCellFill`), so
// a reader can map a fill back to a risk count (0 = unfilled, up to `max`+).
function HeatmapLegend({
    fill,
    max,
    testId,
}: {
    fill: (value: number) => string | null;
    max: number;
    testId: string;
}) {
    const { t } = useTranslation('ictRegisterCommittee');
    const stops = Array.from({ length: max + 1 }, (_, index) => index);
    return (
        <div data-testid={testId} className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-xs text-slate-500 font-medium">{t('cro.heatmap_legend')}</span>
            <div className="flex items-center gap-2">
                {stops.map((value) => {
                    const cellFill = fill(value);
                    return (
                        <span key={value} className="flex items-center gap-1">
                            <span
                                aria-hidden="true"
                                style={cellFill ? { backgroundColor: cellFill } : undefined}
                                className={`h-3 w-3 rounded ${cellFill ? '' : 'bg-white/5'}`}
                            />
                            <span className="text-[10px] text-slate-500 tabular-nums">
                                {value === max ? `${value}+` : value}
                            </span>
                        </span>
                    );
                })}
            </div>
        </div>
    );
}

function CellPill({
    value,
    style,
    testId,
}: {
    value: string | null;
    style: { backgroundColor: string; color: string } | null;
    testId?: string;
}) {
    if (!value) {
        return <span data-testid={testId} />;
    }
    return (
        <span
            data-testid={testId}
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

function TopRisksTable({ risks }: { risks: IctCommitteeTopRisk[] }) {
    const { t } = useTranslation('ictRegisterCommittee');
    const emptyRanks = Array.from({ length: 10 - risks.length }, (_, index) => risks.length + index + 1);
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-slate-500 text-xs uppercase tracking-wide">
                        <th className="py-2 pr-3">{t('top_risks_columns.rank')}</th>
                        <th className="py-2 pr-3">{t('top_risks_columns.id')}</th>
                        <th className="py-2 pr-3">{t('top_risks_columns.subject')}</th>
                        <th className="py-2 pr-3">{t('top_risks_columns.threat')}</th>
                        <th className="py-2 pr-3 text-right">{t('top_risks_columns.gross')}</th>
                        <th className="py-2 pr-3 text-right">{t('top_risks_columns.net')}</th>
                        <th className="py-2 pr-3">{t('top_risks_columns.band')}</th>
                        <th className="py-2 pr-3">{t('top_risks_columns.tolerance')}</th>
                        <th className="py-2">{t('top_risks_columns.status')}</th>
                    </tr>
                </thead>
                <tbody>
                    {risks.map((risk) => (
                        <tr
                            key={risk.rank}
                            data-testid={`committee-top-risk-${risk.rank}`}
                            className="border-t border-white/5"
                        >
                            <td className="py-2 pr-3 text-slate-500 font-bold">{risk.rank}</td>
                            <td className="py-2 pr-3">
                                <Link
                                    to={topRiskPath(risk.risk_id)}
                                    className="text-slate-200 font-semibold hover:text-accent underline decoration-white/20 hover:decoration-accent"
                                >
                                    {risk.code ?? t('common:fallbacks.unknown_risk')}
                                </Link>
                            </td>
                            <td className="py-2 pr-3 text-slate-300">{risk.subject_label}</td>
                            <td className="py-2 pr-3 text-slate-300">{risk.threat_label}</td>
                            <td className="py-2 pr-3 text-right tabular-nums text-slate-300">
                                {risk.gross_score}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums font-bold text-white">
                                {risk.net_score}
                            </td>
                            <td className="py-2 pr-3">
                                <CellPill value={risk.net_band} style={netBandStyle(risk.net_band)} />
                            </td>
                            <td className="py-2 pr-3">
                                <CellPill
                                    value={risk.vs_tolerance}
                                    style={toleranceStyle(risk.vs_tolerance)}
                                />
                            </td>
                            <td className="py-2 text-slate-300">{risk.status_label}</td>
                        </tr>
                    ))}
                    {emptyRanks.map((rank) => (
                        <tr
                            key={rank}
                            data-testid={`committee-top-risk-empty-${rank}`}
                            className="border-t border-white/5"
                        >
                            <td className="py-2 pr-3 text-slate-600 font-bold">{rank}</td>
                            <td className="py-2 text-slate-600" colSpan={8} />
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// RoI-readiness element (issue #52) — the 15 templates of CIR 2024/2956 with
// per-template completeness and the concrete gap drill-down.

const COVERAGE_BADGE_CLASSES: Record<string, string> = {
    full: 'bg-emerald-500/15 text-emerald-400',
    partial: 'bg-amber-500/15 text-amber-400',
    documentary: 'bg-white/5 text-slate-400',
};

function RoiCoverageBadge({ coverage }: { coverage: string }) {
    const { t } = useTranslation('ictRegisterCommittee');
    return (
        <span
            title={t(`roi.coverage_hint.${coverage}`)}
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${
                COVERAGE_BADGE_CLASSES[coverage] ?? 'bg-white/5 text-slate-400'
            }`}
        >
            {t(`roi.coverage.${coverage}`)}
        </span>
    );
}

function RoiTemplateRow({ template }: { template: IctRoiTemplateReadiness }) {
    const { t, i18n } = useTranslation('ictRegisterCommittee');
    const [expanded, setExpanded] = useState(false);
    const documentary = template.coverage === 'documentary';
    const name = i18n.language?.toLowerCase().startsWith('cs')
        ? template.name_cs
        : template.name_en;

    return (
        <div className="py-3 first:pt-0 last:pb-0" data-testid={`committee-roi-template-${template.code}`}>
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="lg:w-2/5">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-400">
                            {template.code}
                        </span>
                        <RoiCoverageBadge coverage={template.coverage} />
                    </div>
                    <p className={`font-semibold mt-0.5 ${documentary ? 'text-slate-400' : 'text-slate-200'}`}>
                        {name}
                    </p>
                    <p className="text-slate-500 text-xs mt-0.5">
                        {t(`roi.feed.${template.feed}`)} · {t(`roi.gate.${template.gate}`)}
                    </p>
                </div>
                <div className="flex-1">
                    {documentary ? (
                        <p className="text-slate-500 text-sm italic">{t(`roi.notes.${template.code}`)}</p>
                    ) : template.row_count === 0 ? (
                        <p className="text-slate-500 text-sm">{t('roi.no_rows')}</p>
                    ) : (
                        <>
                            <div className="flex items-center gap-3">
                                <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                                    <div
                                        data-testid={`committee-roi-bar-${template.code}`}
                                        className={`h-full rounded-full ${roiReadinessBarClass(template.readiness_pct)}`}
                                        style={{ width: `${template.readiness_pct ?? 0}%` }}
                                    />
                                </div>
                                <span className="text-white font-bold tabular-nums text-sm w-16 text-right">
                                    {template.readiness_pct === null
                                        ? '—'
                                        : `${template.readiness_pct} %`}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5 font-medium">
                                <span>{t('roi.row_count', { n: template.row_count })}</span>
                                {template.gap_row_count > 0 ? (
                                    <button
                                        type="button"
                                        data-testid={`committee-roi-toggle-${template.code}`}
                                        onClick={() => setExpanded((value) => !value)}
                                        className="text-slate-400 hover:text-accent font-bold underline decoration-white/20 hover:decoration-accent"
                                    >
                                        {expanded ? t('roi.hide_gaps') : t('roi.show_gaps')} (
                                        {t('roi.gap_count', { n: template.gap_row_count })})
                                    </button>
                                ) : (
                                    <span>{t('roi.no_gaps')}</span>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
            {expanded && template.gap_rows.length > 0 && (
                <div
                    data-testid={`committee-roi-gaps-${template.code}`}
                    className="mt-3 space-y-2 border-t border-white/5 pt-3"
                >
                    {template.gap_rows.length < template.gap_row_count && (
                        <p className="text-slate-500 text-xs italic">
                            {t('roi.gap_rows_truncated', {
                                shown: template.gap_rows.length,
                                total: template.gap_row_count,
                            })}
                        </p>
                    )}
                    {template.gap_rows.map((row, index) => {
                        const path = roiGapRoutePath(row);
                        return (
                            <div
                                key={`${row.entity_type}-${row.entity_id}-${index}`}
                                className="flex flex-col md:flex-row md:items-baseline gap-1.5 md:gap-3"
                            >
                                <div className="md:w-2/5 text-sm">
                                    {path ? (
                                        <Link
                                            to={path}
                                            className="text-slate-200 font-semibold hover:text-accent underline decoration-white/20 hover:decoration-accent"
                                        >
                                            {localizeRegisterRowLabel(row.label, t)}
                                        </Link>
                                    ) : (
                                        <span className="text-slate-300 font-semibold">
                                            {localizeRegisterRowLabel(row.label, t)}
                                        </span>
                                    )}
                                </div>
                                <div className="flex-1 flex flex-wrap items-center gap-1.5">
                                    <span className="text-slate-500 text-xs">{t('roi.missing_label')}</span>
                                    {row.missing.map((missing) => (
                                        <span
                                            key={missing.key}
                                            title={t(`roi.fields.${missing.key}`)}
                                            className="px-2 py-0.5 rounded-lg bg-white/5 text-slate-300 text-xs font-semibold font-mono whitespace-nowrap"
                                        >
                                            {missing.code ?? t(`roi.fields.${missing.key}`)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function RoiReadinessSection({ roi }: { roi: IctRoiReadiness }) {
    const { t } = useTranslation('ictRegisterCommittee');
    return (
        <section className="space-y-4" data-testid="committee-roi">
            <div>
                <h2 className="text-xl font-bold text-white">{t('roi.title')}</h2>
                <p className="text-slate-500 text-sm font-medium mt-1">{t('roi.subtitle')}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-card" data-testid="committee-roi-overall">
                    <p className="text-slate-500 text-xs font-bold min-h-8">{t('roi.overall')}</p>
                    <p className="text-3xl font-bold text-white mt-1 tabular-nums">
                        {roi.overall_readiness_pct === null ? '—' : `${roi.overall_readiness_pct} %`}
                    </p>
                </div>
                <div className="glass-card" data-testid="committee-roi-total-gaps">
                    <p className="text-slate-500 text-xs font-bold min-h-8">{t('roi.total_gaps')}</p>
                    <p className="text-3xl font-bold text-white mt-1 tabular-nums">
                        {roi.total_gap_row_count}
                    </p>
                </div>
            </div>
            <div className="glass-card divide-y divide-white/5">
                {roi.templates.map((template) => (
                    <RoiTemplateRow key={template.code} template={template} />
                ))}
            </div>
        </section>
    );
}

function TopVendorsTable({ vendors }: { vendors: IctCommitteeTopVendor[] }) {
    const { t } = useTranslation('ictRegisterCommittee');
    const emptyRanks = Array.from({ length: 5 - vendors.length }, (_, index) => vendors.length + index + 1);
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-slate-500 text-xs uppercase tracking-wide">
                        <th className="py-2 pr-3">{t('top_vendors_columns.rank')}</th>
                        <th className="py-2 pr-3">{t('top_vendors_columns.vendor')}</th>
                        <th className="py-2 pr-3 text-right">{t('top_vendors_columns.cif_processes')}</th>
                        <th className="py-2">{t('top_vendors_columns.tier')}</th>
                    </tr>
                </thead>
                <tbody>
                    {vendors.map((vendor) => (
                        <tr
                            key={vendor.rank}
                            data-testid={`committee-top-vendor-${vendor.rank}`}
                            className="border-t border-white/5"
                        >
                            <td className="py-2 pr-3 text-slate-500 font-bold">{vendor.rank}</td>
                            <td className="py-2 pr-3">
                                <Link
                                    to={topVendorPath(vendor.vendor_id)}
                                    className="text-slate-200 font-semibold hover:text-accent underline decoration-white/20 hover:decoration-accent"
                                >
                                    {vendor.name}
                                </Link>
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums font-bold text-white">
                                {vendor.cif_process_count}
                            </td>
                            <td className="py-2">
                                <CellPill value={vendor.tier} style={tierStyle(vendor.tier)} />
                            </td>
                        </tr>
                    ))}
                    {emptyRanks.map((rank) => (
                        <tr
                            key={rank}
                            data-testid={`committee-top-vendor-empty-${rank}`}
                            className="border-t border-white/5"
                        >
                            <td className="py-2 pr-3 text-slate-600 font-bold">{rank}</td>
                            <td className="py-2 text-slate-600" colSpan={3} />
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function IctCommitteeSection() {
    const { t } = useTranslation('ictRegisterCommittee');
    const chartTheme = useChartTheme();
    const [data, setData] = useState<IctCommittee | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [isAccessDenied, setIsAccessDenied] = useState(false);

    const fetchCommittee = useCallback(async () => {
        setIsLoading(true);
        setErrorKey(null);
        try {
            setData(await ictRegisterCommitteeApi.getCommittee());
            setIsAccessDenied(false);
        } catch (error) {
            if (isForbiddenApiError(error)) {
                setIsAccessDenied(true);
            } else {
                setErrorKey(apiClient.toUiMessageKey(error));
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchCommittee();
    }, [fetchCommittee]);

    // FR-P3-4 (N17 / C3 / C4): the Committee screen does not consume SortableTable,
    // so it drives the shared table-error contract directly. `hasData` decides whether
    // a failed fetch replaces the screen (first load) or overlays a retry banner above
    // the last-good tiles — a dropped request is never rendered as empty.
    const hasData = data !== null;
    const errorContract = useTableErrorContract({ isError: errorKey !== null, hasData });

    if (isAccessDenied) {
        return <ReadAccessDeniedState />;
    }

    // Explicit aria-busy loading branch — only while there is nothing to show yet.
    // A refetch over existing data keeps the (stale) tiles and spins the refresh button.
    if (isLoading && !hasData) {
        return (
            <div
                className="flex flex-col items-center justify-center gap-4 py-24"
                aria-busy="true"
                data-loading="true"
                data-testid="committee-loading"
            >
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">
                    {t('loading')}
                </p>
            </div>
        );
    }

    // Failed first load with no last-good data → replace the screen with the shared
    // localized error + retry, never an empty state (C4, N17).
    if (errorContract.showErrorBlock) {
        return (
            <TableErrorState
                onRetry={() => void fetchCommittee()}
                isRetrying={isLoading}
                testId="committee-error"
            />
        );
    }

    const narrativeValues = data ? narrativeParams(data.cro.narratives) : null;

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
                    <p className="text-slate-500 font-medium mt-1">{t('subtitle')}</p>
                </div>
                <button
                    type="button"
                    onClick={() => void fetchCommittee()}
                    data-testid="committee-refresh-button"
                    className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 font-bold hover:bg-white/10 transition-all flex items-center gap-2"
                >
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    {t('actions.refresh')}
                </button>
            </div>

            {/* Refetch failed while last-good tiles are shown → non-blocking banner
                over the stale data (error-overlay), never a silent revert to empty. */}
            {errorContract.showErrorBanner && (
                <TableErrorState
                    variant="banner"
                    onRetry={() => void fetchCommittee()}
                    isRetrying={isLoading}
                    testId="committee-error-banner"
                />
            )}

            {data && (
                <>
                    {/* 16_Dashboard — Provozní přehled správce registru */}
                    <section className="space-y-4" data-testid="committee-dashboard">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                            <h2 className="text-xl font-bold text-white">{t('dashboard.title')}</h2>
                            {/* The workbook's row-5 nav chrome, mapped in-app. */}
                            <div className="flex gap-4 text-sm font-semibold">
                                <Link
                                    to="/ict-register/data-quality"
                                    data-testid="committee-nav-dq"
                                    className="text-slate-400 hover:text-accent transition-colors"
                                >
                                    {t('nav.dq')}
                                </Link>
                                <a
                                    href="#cro"
                                    data-testid="committee-nav-cro"
                                    className="text-slate-400 hover:text-accent transition-colors"
                                >
                                    {t('nav.cro')}
                                </a>
                            </div>
                        </div>

                        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
                            {t('dashboard.state_heading')}
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            {STATE_TILE_KEYS.map((key) => (
                                <Link key={key} to={stateTileDrilldownPath(key)} className="glass-card block hover:bg-white/5 transition-colors">
                                    <div data-testid={`committee-state-${key}`}>
                                        <p className="text-slate-500 text-xs font-medium min-h-8">
                                            {t(`state.${key}`)}
                                        </p>
                                        <p
                                            className={`text-2xl font-bold mt-1 tabular-nums ${
                                                BLOCKING_STATE_KEYS.has(key)
                                                    ? blockingCountClass(data.dashboard.register_state[key])
                                                    : 'text-white'
                                            }`}
                                        >
                                            {data.dashboard.register_state[key]}
                                        </p>
                                    </div>
                                </Link>
                            ))}
                        </div>

                        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
                            {t('dashboard.metrics_heading')}
                        </h3>
                        <div className="glass-card overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-slate-500 text-xs uppercase tracking-wide">
                                        <th className="py-2 pr-3">{t('dashboard.metrics_columns.metric')}</th>
                                        <th className="py-2 pr-3 text-right">
                                            {t('dashboard.metrics_columns.value')}
                                        </th>
                                        <th className="py-2 pr-3">
                                            {t('dashboard.metrics_columns.interpretation')}
                                        </th>
                                        <th className="py-2 pr-3">{t('dashboard.metrics_columns.source')}</th>
                                        <th className="py-2">{t('dashboard.metrics_columns.action')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {METRIC_KEYS.map((key) => (
                                        <tr
                                            key={key}
                                            data-testid={`committee-metric-${key}`}
                                            className="border-t border-white/5"
                                        >
                                            <td className="py-2.5 pr-3 text-slate-200 font-semibold">
                                                {t(`metrics.${key}.label`)}
                                            </td>
                                            <td className="py-2.5 pr-3 text-right">
                                                <Link
                                                    to={metricDrilldownPath(key)}
                                                    className={`text-lg font-bold tabular-nums hover:text-accent underline decoration-white/20 hover:decoration-accent ${
                                                        BLOCKING_METRIC_KEYS.has(key)
                                                            ? blockingCountClass(data.dashboard.key_metrics[key])
                                                            : 'text-white'
                                                    }`}
                                                >
                                                    {data.dashboard.key_metrics[key]}
                                                </Link>
                                            </td>
                                            <td className="py-2.5 pr-3 text-slate-400">
                                                {t(`metrics.${key}.interpretation`)}
                                            </td>
                                            <td className="py-2.5 pr-3">
                                                <Link
                                                    to={metricDrilldownPath(key)}
                                                    className="text-slate-400 hover:text-accent underline decoration-white/20 hover:decoration-accent"
                                                >
                                                    {t(`metrics.${key}.source`)}
                                                </Link>
                                            </td>
                                            <td className="py-2.5 text-slate-400">{t(`metrics.${key}.action`)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* 18_CRO_přehled — Manažerské shrnutí */}
                    <section id="cro" className="space-y-4" data-testid="committee-cro">
                        <h2 className="text-xl font-bold text-white">{t('cro.title')}</h2>

                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                            {KPI_KEYS.map((key) => {
                                // C7 "Materiální" is production-inert (no app
                                // materiality column): muted "not yet
                                // measurable", never a silent 0.
                                const inert =
                                    key === 'material_risk_count' &&
                                    Boolean(data.cro.kpi.material_risk_count_production_inert);
                                return (
                                    <Link
                                        key={key}
                                        to={kpiDrilldownPath(key)}
                                        className="glass-card block hover:bg-white/5 transition-colors"
                                    >
                                        <div
                                            data-testid={`committee-kpi-${key}`}
                                            title={inert ? t('kpi_not_measurable_hint') : undefined}
                                        >
                                            <p className="text-slate-500 text-xs font-bold text-center min-h-8">
                                                {t(`kpi.${key}`)}
                                            </p>
                                            {inert ? (
                                                <>
                                                    <p className="text-3xl font-bold text-slate-600 text-center mt-1">
                                                        —
                                                    </p>
                                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 text-center mt-1">
                                                        {t('kpi_not_measurable')}
                                                    </p>
                                                </>
                                            ) : (
                                                <p
                                                    className={`text-3xl font-bold text-center mt-1 tabular-nums ${
                                                        BLOCKING_KPI_KEYS.has(key)
                                                            ? blockingCountClass(data.cro.kpi[key])
                                                            : 'text-white'
                                                    }`}
                                                >
                                                    {data.cro.kpi[key]}
                                                </p>
                                            )}
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            {/* Heatmap (§2.2): full 5×5, probability 5..1 down. */}
                            <div className="glass-card" data-testid="committee-heatmap">
                                <h3 className="text-white font-bold">{t('cro.heatmap_title')}</h3>
                                <p className="text-slate-500 text-xs font-medium mt-1">{t('cro.heatmap_axis')}</p>
                                {/* FR-P5-3: horizontal-scroll container so the dense matrix
                                    grid scrolls at narrow effective widths instead of being
                                    clipped by an ancestor `overflow-hidden`. */}
                                <div className="mt-3 space-y-1.5 overflow-x-auto">
                                    {data.cro.heatmap.rows.map((row) => (
                                        <div key={row.probability} className="flex items-center gap-1.5">
                                            <span className="w-5 text-right text-xs text-slate-500 font-bold">
                                                {row.probability}
                                            </span>
                                            <div className="grid grid-cols-5 gap-1.5 flex-1">
                                                {row.cells.map((count, index) => (
                                                    <Link
                                                        key={index}
                                                        to="/risks"
                                                        className="block"
                                                    >
                                                        <MatrixCell
                                                            fill={heatmapCellFill(count)}
                                                            count={count}
                                                            testId={`committee-heatmap-cell-${row.probability}-${index + 1}`}
                                                        />
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-5" />
                                        <div className="grid grid-cols-5 gap-1.5 flex-1">
                                            {HEATMAP_SUBJECT_VALUES.map((value) => (
                                                <span
                                                    key={value}
                                                    className="text-center text-xs text-slate-500 font-bold"
                                                >
                                                    {value}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <HeatmapLegend
                                    fill={heatmapCellFill}
                                    max={4}
                                    testId="committee-heatmap-legend"
                                />
                            </div>

                            {/* Migration matrix (§2.3): gross bands down, net bands across. */}
                            <div className="glass-card" data-testid="committee-migration">
                                <h3 className="text-white font-bold">{t('cro.migration_title')}</h3>
                                <p className="text-slate-500 text-xs font-medium mt-1">{t('cro.migration_axis')}</p>
                                {/* FR-P5-3: horizontal-scroll container so the dense matrix
                                    grid scrolls at narrow effective widths instead of being
                                    clipped by an ancestor `overflow-hidden`. */}
                                <div className="mt-3 space-y-1.5 overflow-x-auto">
                                    {data.cro.migration_matrix.rows.map((row) => (
                                        <div key={row.gross_band} className="flex items-center gap-1.5">
                                            <span className="w-16 text-right text-xs text-slate-500 font-bold">
                                                {row.gross_band}
                                            </span>
                                            <div className="grid grid-cols-4 gap-1.5 flex-1">
                                                {row.cells.map((count, index) => (
                                                    <Link key={index} to="/risks" className="block">
                                                        <MatrixCell
                                                            fill={migrationCellFill(count)}
                                                            count={count}
                                                            testId={`committee-migration-cell-${row.gross_band}-${NET_BANDS[index]}`}
                                                        />
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-16" />
                                        <div className="grid grid-cols-4 gap-1.5 flex-1">
                                            {NET_BANDS.map((band) => (
                                                <span
                                                    key={band}
                                                    className="text-center text-xs text-slate-500 font-bold"
                                                >
                                                    {band}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <HeatmapLegend
                                    fill={migrationCellFill}
                                    max={5}
                                    testId="committee-migration-legend"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            <div className="glass-card">
                                <h3 className="text-white font-bold mb-3">{t('cro.top_risks_title')}</h3>
                                <TopRisksTable risks={data.cro.top_risks} />
                            </div>
                            <div className="glass-card">
                                <h3 className="text-white font-bold mb-3">{t('cro.top_vendors_title')}</h3>
                                <TopVendorsTable vendors={data.cro.top_vendors} />
                            </div>
                        </div>

                        {/* Narratives (§2.6): five live sentences from structured values. */}
                        <div className="glass-card space-y-2" data-testid="committee-narratives">
                            <h3 className="text-white font-bold">{t('cro.narratives_title')}</h3>
                            {narrativeValues && (
                                <>
                                    <p data-testid="committee-narrative-a34" className="text-slate-300 text-sm">
                                        {t('narratives.a34', narrativeValues.a34)}
                                    </p>
                                    <p data-testid="committee-narrative-a35" className="text-slate-300 text-sm">
                                        {t('narratives.a35', narrativeValues.a35)}
                                    </p>
                                    <p data-testid="committee-narrative-a36" className="text-slate-300 text-sm">
                                        {t('narratives.a36', narrativeValues.a36)}
                                    </p>
                                    <p data-testid="committee-narrative-a37" className="text-slate-300 text-sm">
                                        {t('narratives.a37', narrativeValues.a37)}
                                    </p>
                                    <p data-testid="committee-narrative-a38" className="text-slate-500 text-sm italic">
                                        {t('narratives.a38', narrativeValues.a38)}
                                    </p>
                                </>
                            )}
                        </div>

                        {/* Aggregates (§2.7) feeding the two bar charts. */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            <div className="glass-card" data-testid="committee-chart-assets">
                                <h3 className="text-white font-bold mb-3">{t('cro.assets_chart_title')}</h3>
                                <ResponsiveContainer width="100%" height={240} initialDimension={{ width: 1, height: 240 }}>
                                    <BarChart
                                        data={data.cro.assets_by_criticality}
                                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                    >
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            stroke={chartTheme.gridStroke}
                                            vertical={false}
                                        />
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
                                        {/* ch1 is legendless (inventory §2.7). */}
                                        <Bar dataKey="count" fill={chartTheme.series.primary} radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="glass-card" data-testid="committee-chart-risk-bands">
                                <h3 className="text-white font-bold mb-3">{t('cro.risk_bands_chart_title')}</h3>
                                <ResponsiveContainer width="100%" height={240} initialDimension={{ width: 1, height: 240 }}>
                                    <BarChart
                                        data={riskBandChartRows(data.cro.risks_by_band)}
                                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                    >
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            stroke={chartTheme.gridStroke}
                                            vertical={false}
                                        />
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
                                        {/* ch2 keeps its legend (inventory §2.7). */}
                                        <Legend />
                                        <Bar
                                            dataKey="gross"
                                            name={t('cro.risk_bands_gross')}
                                            fill={chartTheme.series.neutral}
                                            radius={[6, 6, 0, 0]}
                                        />
                                        <Bar
                                            dataKey="net"
                                            name={t('cro.risk_bands_net')}
                                            fill={chartTheme.series.primary}
                                            radius={[6, 6, 0, 0]}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </section>

                    {/* RoI readiness (#52) — the 15 CIR 2024/2956 templates. */}
                    <RoiReadinessSection roi={data.roi_readiness} />
                </>
            )}

            {!isLoading && !data && !errorKey && (
                <div className="glass-card text-slate-500 text-center py-8">{t('empty')}</div>
            )}
        </div>
    );
}
