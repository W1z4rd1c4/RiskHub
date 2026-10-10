import { heatCellClass, heatLevelForCount, severityClass, vendorTierClass, type SeverityBand } from '@/lib/severity';
import { toneClass } from '@/lib/tones';
import { canonicalAssetCriticality } from '@/pages/shared/ictRegisterSemanticFilters';
import type {
    IctCommittee,
    IctCommitteeKeyMetrics,
    IctCommitteeRegisterState,
    IctCommitteeRiskBandCounts,
    IctRoiGapRow,
} from '@/types/ictRegisterCommittee';

type PresentationTone = 'neutral' | 'success' | 'warning';
type Translate = (key: string, values?: Record<string, unknown>) => string;

interface IctCommitteeLocale {
    language: string;
    t: Translate;
}

interface StateTilePresentation {
    countClass: string;
    href: string;
    key: keyof IctCommitteeRegisterState;
    label: string;
    tone: PresentationTone;
    value: number;
}

interface MetricPresentation {
    action: string;
    countClass: string;
    href: string;
    interpretation: string;
    key: keyof IctCommitteeKeyMetrics;
    label: string;
    source: string;
    tone: PresentationTone;
    value: number;
}

interface KpiPresentation {
    countClass: string;
    displayValue: number | '—';
    href: string | null;
    inert: boolean;
    inertHint: string | null;
    inertLabel: string | null;
    key: CommitteeKpiKey;
    label: string;
    tone: PresentationTone;
}

interface MatrixCellPresentation {
    /** Accessible name of the drill-down link (axis values + count, GAP-B-16). */
    ariaLabel: string;
    count: number;
    /** `--heat-N` cell recipe (sequential count scale, DS-23). */
    heatClass: string;
    href: string;
}

interface TopRiskPresentation {
    grossScore: number | null;
    href: string;
    label: string;
    netBand: string | null;
    netBandClass: string | null;
    netScore: number | null;
    rank: number;
    statusLabel: string | null;
    subjectLabel: string;
    threatLabel: string;
    tolerance: string | null;
    toleranceClass: string | null;
}

interface TopVendorPresentation {
    cifProcessCount: number;
    href: string;
    name: string;
    rank: number;
    tier: string;
    tierClass: string | null;
}

interface RoiGapRowPresentation {
    href: string | null;
    key: string;
    label: string;
    missing: Array<{ key: string; label: string; title: string }>;
    missingLabel: string;
}

interface RoiTemplatePresentation {
    code: string;
    coverageClass: string;
    coverageHint: string;
    coverageLabel: string;
    documentary: boolean;
    feedAndGate: string;
    gapCountLabel: string;
    gapRowCount: number;
    gapRows: RoiGapRowPresentation[];
    hideGapsLabel: string;
    name: string;
    noGapsLabel: string;
    noRowsLabel: string;
    note: string;
    readinessBarClass: string;
    readinessLabel: string;
    readinessPct: number | null;
    rowCount: number;
    rowCountLabel: string;
    showGapsLabel: string;
    truncatedLabel: string | null;
}

export interface IctCommitteePresentation {
    dashboard: {
        metrics: MetricPresentation[];
        metricsColumns: {
            action: string;
            interpretation: string;
            metric: string;
            source: string;
            value: string;
        };
        metricsHeading: string;
        navigation: { croHref: string; croLabel: string; dqHref: string; dqLabel: string };
        stateHeading: string;
        stateTiles: StateTilePresentation[];
        title: string;
    };
    executiveSummary: {
        assetChart: Array<{ band: string; count: number; href: string; label: string }>;
        /** Text alternative of the asset chart (GAP-D-11): summary + data-table headers. */
        assetChartSummary: string;
        assetChartColumns: { band: string; count: string };
        assetChartTitle: string;
        heatmap: {
            axis: string;
            columns: readonly number[];
            legend: string;
            legendStops: Array<{ heatClass: string; label: string; value: number }>;
            rows: Array<{
                probability: number;
                cells: Array<MatrixCellPresentation & { column: number }>;
            }>;
            title: string;
        };
        kpis: KpiPresentation[];
        migration: {
            axis: string;
            columns: readonly string[];
            columnLabels: readonly string[];
            legend: string;
            legendStops: Array<{ heatClass: string; label: string; value: number }>;
            rows: Array<{
                grossBand: string;
                grossBandLabel: string;
                cells: Array<MatrixCellPresentation & { band: string }>;
            }>;
            title: string;
        };
        narratives: Array<{
            className: string;
            key: 'a34' | 'a35' | 'a36' | 'a37' | 'a38';
            text: string;
        }>;
        narrativesTitle: string;
        riskBandChart: Array<{
            band: string;
            label: string;
            gross: number;
            grossHref: string;
            net: number;
            netHref: string;
        }>;
        riskBandChartLabels: { gross: string; net: string };
        /** Text alternative of the risk-band chart (GAP-D-11): summary + band column header. */
        riskBandChartSummary: string;
        riskBandChartBandColumn: string;
        riskBandChartTitle: string;
        title: string;
        emptyRiskRanks: number[];
        emptyVendorRanks: number[];
        topRisks: TopRiskPresentation[];
        topRisksColumns: {
            band: string;
            gross: string;
            id: string;
            net: string;
            rank: string;
            status: string;
            subject: string;
            threat: string;
            tolerance: string;
        };
        topRisksTitle: string;
        topVendors: TopVendorPresentation[];
        topVendorsColumns: { cifProcesses: string; rank: string; tier: string; vendor: string };
        topVendorsTitle: string;
    };
    roiReadiness: {
        overallLabel: string;
        overallValue: string;
        subtitle: string;
        templates: RoiTemplatePresentation[];
        title: string;
        totalGapsLabel: string;
        totalGapsValue: number;
    };
    sections: readonly IctCommitteePresentationSection[];
}

export type IctCommitteePresentationSection =
    | { key: 'dashboard'; presentation: IctCommitteePresentation['dashboard'] }
    | { key: 'executiveSummary'; presentation: IctCommitteePresentation['executiveSummary'] }
    | { key: 'roiReadiness'; presentation: IctCommitteePresentation['roiReadiness'] };

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

const METRIC_KEYS: (keyof IctCommitteeKeyMetrics)[] = [
    'cif_process_count',
    'processes_without_impact_assessment_count',
    'critical_asset_count',
    'critical_vendor_count',
    'risks_above_tolerance_count',
    'open_dq_finding_count',
];

type CommitteeKpiKey =
    | 'risk_count'
    | 'material_risk_count'
    | 'risks_above_tolerance_count'
    | 'accepted_above_tolerance_count'
    | 'cif_without_bcm_count'
    | 'open_dq_finding_count';

const KPI_KEYS: CommitteeKpiKey[] = [
    'risk_count',
    'material_risk_count',
    'risks_above_tolerance_count',
    'accepted_above_tolerance_count',
    'cif_without_bcm_count',
    'open_dq_finding_count',
];

const NET_BANDS = ['Nízké', 'Střední', 'Vysoké', 'Kritické'] as const;
const HEATMAP_SUBJECT_VALUES = [1, 2, 3, 4, 5] as const;

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
const BLOCKING_KPI_KEYS = new Set<CommitteeKpiKey>([
    'risks_above_tolerance_count',
    'accepted_above_tolerance_count',
    'cif_without_bcm_count',
    'open_dq_finding_count',
]);

// Verbatim workbook labels → colours from the severity SSOT (lib/severity.ts,
// D1 / ADR-015 Addendum 1): the net risk band is a 4-step risk band; vendor
// tiers follow TierDod (standard = neutral, PM-3); tolerance is a RAG outcome.
const NET_BAND_SEVERITY: Record<string, SeverityBand> = {
    Nízké: 'low',
    Střední: 'medium',
    Vysoké: 'high',
    Kritické: 'critical',
};
const NET_BAND_CLASSES: Record<string, string> = Object.fromEntries(
    Object.entries(NET_BAND_SEVERITY).map(([label, band]) => [label, severityClass('fill', band)]),
);
const TOLERANCE_CLASSES: Record<string, string> = {
    'V toleranci': toneClass('success', 'fill'),
    'NAD TOLERANCI': toneClass('danger', 'fill'),
};
const TIER_CLASSES: Record<string, string> = {
    'Kritický dodavatel': vendorTierClass('fill', 'critical') ?? '',
    'Významný dodavatel': vendorTierClass('fill', 'significant') ?? '',
    'Standardní dodavatel': vendorTierClass('fill', 'standard') ?? '',
};

const CONTROLLED_LABEL_KEYS: Readonly<Record<string, string>> = {
    Nízké: 'controlled.risk_band.low',
    Střední: 'controlled.risk_band.medium',
    Vysoké: 'controlled.risk_band.high',
    Kritické: 'controlled.risk_band.critical',
    'V toleranci': 'controlled.tolerance.within',
    'NAD TOLERANCI': 'controlled.tolerance.above',
    'Kritický dodavatel': 'controlled.vendor_tier.critical',
    'Významný dodavatel': 'controlled.vendor_tier.significant',
    'Standardní dodavatel': 'controlled.vendor_tier.standard',
    Otevřené: 'controlled.risk_status.open',
    'V řešení': 'controlled.risk_status.in_progress',
    Uzavřené: 'controlled.risk_status.closed',
    Akceptováno: 'controlled.risk_status.accepted',
};
const ASSET_CRITICALITY_LABEL_KEYS: Readonly<Record<string, string>> = {
    Nízká: 'controlled.asset_criticality.low',
    Střední: 'controlled.asset_criticality.medium',
    Vysoká: 'controlled.asset_criticality.high',
    Kritická: 'controlled.asset_criticality.critical',
};

const COVERAGE_BADGE_CLASSES: Record<string, string> = {
    full: 'bg-success text-success-foreground',
    partial: 'bg-warning text-warning-foreground',
    documentary: 'bg-tint/5 text-muted-foreground',
};

const CRO_IN_PAGE_HREF = '#cro';
const DQ_PAGE = '/ict-register/data-quality';
const DQ_FINDINGS_PATH = `${DQ_PAGE}?status=findings`;

/** Heat-scale recipe for a count; `maxAnchor` and above take the top step (DS-23). */
function heatClassForCount(count: number, maxAnchor: number): string {
    return heatCellClass(heatLevelForCount(count, maxAnchor));
}

function filteredRegisterPath(path: string, filters: Record<string, string | number | boolean>): string {
    return `${path}?${new URLSearchParams(
        Object.entries(filters).map(([key, value]) => [key, String(value)]),
    ).toString()}`;
}

function committeeRegisterPath(
    path: '/assets' | '/vendors',
    filters: Record<string, string | number | boolean> = {},
): string {
    return filteredRegisterPath(path, { committee_scope: true, ...filters });
}

function committeeRiskPath(filters: Record<string, string | number | boolean> = {}): string {
    return filteredRegisterPath('/risks', { committee_scope: true, ict_linked: true, ...filters });
}

function dqCheckPath(checkId: string): string {
    return `${DQ_PAGE}?check=${checkId}`;
}

const STATE_TILE_PATHS: Record<keyof IctCommitteeRegisterState, string> = {
    process_count: '/processes',
    asset_count: committeeRegisterPath('/assets'),
    process_asset_link_count: committeeRegisterPath('/assets', { has_process_link: true }),
    vendor_count: committeeRegisterPath('/vendors'),
    assets_pending_review_count: dqCheckPath('DQ-09'),
    direct_process_vendor_link_count: committeeRegisterPath('/vendors', { has_direct_process_link: true }),
    contracts_in_roi_scope_count: committeeRegisterPath('/vendors', { has_roi_contract: true }),
    sub_outsourcing_link_count: committeeRegisterPath('/vendors', { has_sub_outsourcing: true }),
    assets_without_data_classification_count: dqCheckPath('DQ-46'),
    top_tier_vendors_without_orderly_exit_count: dqCheckPath('DQ-49'),
};

const METRIC_PATHS: Record<keyof IctCommitteeKeyMetrics, string> = {
    cif_process_count: filteredRegisterPath('/processes', { cif: true }),
    processes_without_impact_assessment_count: dqCheckPath('DQ-04'),
    critical_asset_count: committeeRegisterPath('/assets', { criticality: 'critical' }),
    critical_vendor_count: committeeRegisterPath('/vendors', { tier: 'critical' }),
    risks_above_tolerance_count: committeeRiskPath({ above_tolerance: true }),
    open_dq_finding_count: DQ_FINDINGS_PATH,
};

const KPI_PATHS: Record<CommitteeKpiKey, string> = {
    risk_count: committeeRiskPath(),
    material_risk_count: committeeRiskPath(),
    risks_above_tolerance_count: committeeRiskPath({ above_tolerance: true }),
    accepted_above_tolerance_count: committeeRiskPath({ above_tolerance: true, response: 'acceptance' }),
    cif_without_bcm_count: dqCheckPath('DQ-05'),
    open_dq_finding_count: DQ_FINDINGS_PATH,
};

const ROI_ROUTE_PATHS: Record<string, (id: number) => string> = {
    process: (id) => `/processes/${id}`,
    asset: (id) => `/assets/${id}`,
    vendor: (id) => `/vendors/${id}`,
};

function blockingTone(value: number): PresentationTone {
    return value > 0 ? 'warning' : 'success';
}

function countClass(tone: PresentationTone): string {
    if (tone === 'warning') return 'text-warning-text';
    if (tone === 'success') return 'text-success-text';
    return 'text-foreground';
}

function classFor(value: string | null, classes: Record<string, string>): string | null {
    return value ? (classes[value] ?? null) : null;
}

function controlledLabel(
    value: string | null,
    translate: Translate,
    keys: Readonly<Record<string, string>> = CONTROLLED_LABEL_KEYS,
): string | null {
    if (!value) return null;
    const key = keys[value];
    return key ? translate(key) : value;
}

/**
 * PG-40: the drill-down URL carries the language-neutral band code (`high`), which the
 * risk register maps back to the stored workbook value before the request; an unknown
 * band passes through unchanged.
 */
function riskBandCode(band: string): string {
    return NET_BAND_SEVERITY[band] ?? band;
}

function riskBandPath(band: string, score: 'gross' | 'net'): string {
    return committeeRiskPath({ [`${score}_band`]: riskBandCode(band) });
}

function roiGapPath(row: IctRoiGapRow): string | null {
    const build = ROI_ROUTE_PATHS[row.route_entity_type];
    return build ? build(row.route_entity_id) : null;
}

function localizeUnknownLabel(label: string, translate: Translate): string {
    return label.replace(/\{\{(\w+)\}\}/g, (_full, key: string) => translate(`common:fallbacks.${key}`));
}

function normalizeLookupLabel(label: string | null, fallback: string): string {
    const normalized = label?.trim();
    return normalized && normalized !== '?' ? normalized : fallback;
}

function readinessBarClass(value: number | null): string {
    if (value === null) return 'bg-muted-foreground';
    if (value >= 80) return 'bg-success';
    if (value >= 50) return 'bg-warning';
    return 'bg-destructive';
}

function buildNarratives(
    snapshot: IctCommittee,
    translate: Translate,
): IctCommitteePresentation['executiveSummary']['narratives'] {
    const values = snapshot.cro.narratives;
    const params = {
        a34: { cif: values.cif_process_count, total: values.process_count, bcm: values.cif_with_bcm_count },
        a35: {
            critical: values.critical_vendor_count,
            exit: values.critical_vendors_with_functional_exit_count,
            legal: values.critical_vendors_with_identifier_count,
        },
        a36: {
            tolerance: values.tolerance,
            above: values.risks_above_tolerance_count,
            accepted: values.accepted_above_tolerance_count,
        },
        a37: { links: values.sub_outsourcing_link_count, subRole: values.vendors_in_sub_role_count },
        a38: { tolerance: values.tolerance },
    };
    return (Object.keys(params) as Array<keyof typeof params>).map((key) => ({
        className: key === 'a38' ? 'text-muted-foreground text-sm italic' : 'text-foreground text-sm',
        key,
        text: translate(`narratives.${key}`, params[key]),
    }));
}

function buildRoiTemplates(
    snapshot: IctCommittee,
    locale: IctCommitteeLocale,
): IctCommitteePresentation['roiReadiness']['templates'] {
    const { language } = locale;
    const translate = locale.t;
    const useCzech = language.toLowerCase().startsWith('cs');
    return snapshot.roi_readiness.templates.map((template) => ({
        code: template.code,
        coverageClass: COVERAGE_BADGE_CLASSES[template.coverage] ?? 'bg-tint/5 text-muted-foreground',
        coverageHint: translate(`roi.coverage_hint.${template.coverage}`),
        coverageLabel: translate(`roi.coverage.${template.coverage}`),
        documentary: template.coverage === 'documentary',
        feedAndGate: `${translate(`roi.feed.${template.feed}`)} · ${translate(`roi.gate.${template.gate}`)}`,
        gapCountLabel: translate('roi.gap_count', { n: template.gap_row_count }),
        gapRowCount: template.gap_row_count,
        gapRows: template.gap_rows.map((row, index) => ({
            href: roiGapPath(row),
            key: `${row.entity_type}-${row.entity_id}-${index}`,
            label: localizeUnknownLabel(row.label, translate),
            missing: row.missing.map((missing) => ({
                key: missing.key,
                label: missing.code ?? translate(`roi.fields.${missing.key}`),
                title: translate(`roi.fields.${missing.key}`),
            })),
            missingLabel: translate('roi.missing_label'),
        })),
        hideGapsLabel: translate('roi.hide_gaps'),
        name: useCzech ? template.name_cs : template.name_en,
        noGapsLabel: translate('roi.no_gaps'),
        noRowsLabel: translate('roi.no_rows'),
        note: translate(`roi.notes.${template.code}`),
        readinessBarClass: readinessBarClass(template.readiness_pct),
        readinessLabel: template.readiness_pct === null ? '—' : `${template.readiness_pct} %`,
        readinessPct: template.readiness_pct,
        rowCount: template.row_count,
        rowCountLabel: translate('roi.row_count', { count: template.row_count }),
        showGapsLabel: translate('roi.show_gaps'),
        truncatedLabel:
            template.gap_rows.length < template.gap_row_count
                ? translate('roi.gap_rows_truncated', {
                      shown: template.gap_rows.length,
                      total: template.gap_row_count,
                  })
                : null,
    }));
}

export function buildIctCommitteePresentation(
    snapshot: IctCommittee,
    locale: IctCommitteeLocale,
): IctCommitteePresentation {
    const translate = locale.t;
    const stateTiles = STATE_TILE_KEYS.map((key) => {
        const value = snapshot.dashboard.register_state[key];
        const tone = BLOCKING_STATE_KEYS.has(key) ? blockingTone(value) : 'neutral';
        return {
            countClass: countClass(tone),
            href: STATE_TILE_PATHS[key],
            key,
            label: translate(`state.${key}`),
            tone,
            value,
        } satisfies StateTilePresentation;
    });
    const metrics = METRIC_KEYS.map((key) => {
        const value = snapshot.dashboard.key_metrics[key];
        const tone = BLOCKING_METRIC_KEYS.has(key) ? blockingTone(value) : 'neutral';
        return {
            action: translate(`metrics.${key}.action`),
            countClass: countClass(tone),
            href: METRIC_PATHS[key],
            interpretation: translate(`metrics.${key}.interpretation`),
            key,
            label: translate(`metrics.${key}.label`),
            source: translate(`metrics.${key}.source`),
            tone,
            value,
        } satisfies MetricPresentation;
    });
    const kpis = KPI_KEYS.map((key) => {
        const inert = key === 'material_risk_count' && Boolean(snapshot.cro.kpi.material_risk_count_production_inert);
        const value = snapshot.cro.kpi[key];
        const tone = BLOCKING_KPI_KEYS.has(key) ? blockingTone(value) : 'neutral';
        return {
            countClass: countClass(tone),
            displayValue: inert ? '—' : value,
            href: inert ? null : KPI_PATHS[key],
            inert,
            inertHint: inert ? translate('kpi_not_measurable_hint') : null,
            inertLabel: inert ? translate('kpi_not_measurable') : null,
            key,
            label: translate(`kpi.${key}`),
            tone,
        } satisfies KpiPresentation;
    });

    const presentation: Omit<IctCommitteePresentation, 'sections'> = {
        dashboard: {
            metrics,
            metricsColumns: {
                action: translate('dashboard.metrics_columns.action'),
                interpretation: translate('dashboard.metrics_columns.interpretation'),
                metric: translate('dashboard.metrics_columns.metric'),
                source: translate('dashboard.metrics_columns.source'),
                value: translate('dashboard.metrics_columns.value'),
            },
            metricsHeading: translate('dashboard.metrics_heading'),
            navigation: {
                croHref: CRO_IN_PAGE_HREF,
                croLabel: translate('nav.cro'),
                dqHref: DQ_PAGE,
                dqLabel: translate('nav.dq'),
            },
            stateHeading: translate('dashboard.state_heading'),
            stateTiles,
            title: translate('dashboard.title'),
        },
        executiveSummary: {
            assetChart: snapshot.cro.assets_by_criticality.map((entry) => ({
                ...entry,
                label: controlledLabel(entry.band, translate, ASSET_CRITICALITY_LABEL_KEYS) ?? entry.band,
                href: committeeRegisterPath('/assets', {
                    criticality: canonicalAssetCriticality(entry.band) ?? entry.band,
                }),
            })),
            assetChartSummary: translate('cro.assets_chart_summary', {
                total: snapshot.cro.assets_by_criticality.reduce((sum, entry) => sum + entry.count, 0),
            }),
            assetChartColumns: {
                band: translate('cro.assets_chart_columns.criticality'),
                count: translate('cro.assets_chart_columns.assets'),
            },
            assetChartTitle: translate('cro.assets_chart_title'),
            heatmap: {
                axis: translate('cro.heatmap_axis'),
                columns: HEATMAP_SUBJECT_VALUES,
                legend: translate('cro.heatmap_legend'),
                legendStops: Array.from({ length: 5 }, (_, value) => ({
                    heatClass: heatClassForCount(value, 4),
                    label: value === 4 ? '4+' : String(value),
                    value,
                })),
                rows: snapshot.cro.heatmap.rows.map((row) => ({
                    probability: row.probability,
                    cells: row.cells.map((count, index) => ({
                        ariaLabel: translate('cro.heatmap_cell_aria', {
                            count,
                            probability: row.probability,
                            impact: index + 1,
                        }),
                        column: index + 1,
                        count,
                        heatClass: heatClassForCount(count, 4),
                        href: committeeRiskPath({ gross_probability: row.probability, gross_impact: index + 1 }),
                    })),
                })),
                title: translate('cro.heatmap_title'),
            },
            kpis,
            migration: {
                axis: translate('cro.migration_axis'),
                columns: NET_BANDS,
                columnLabels: NET_BANDS.map((band) => controlledLabel(band, translate) ?? band),
                legend: translate('cro.heatmap_legend'),
                legendStops: Array.from({ length: 6 }, (_, value) => ({
                    heatClass: heatClassForCount(value, 5),
                    label: value === 5 ? '5+' : String(value),
                    value,
                })),
                rows: snapshot.cro.migration_matrix.rows.map((row) => ({
                    grossBand: row.gross_band,
                    grossBandLabel: controlledLabel(row.gross_band, translate) ?? row.gross_band,
                    cells: row.cells.map((count, index) => ({
                        ariaLabel: translate('cro.migration_cell_aria', {
                            count,
                            gross: controlledLabel(row.gross_band, translate) ?? row.gross_band,
                            net: controlledLabel(NET_BANDS[index], translate) ?? NET_BANDS[index],
                        }),
                        band: NET_BANDS[index],
                        count,
                        heatClass: heatClassForCount(count, 5),
                        href: committeeRiskPath({ gross_band: riskBandCode(row.gross_band), net_band: riskBandCode(NET_BANDS[index]) }),
                    })),
                })),
                title: translate('cro.migration_title'),
            },
            narratives: buildNarratives(snapshot, translate),
            narrativesTitle: translate('cro.narratives_title'),
            riskBandChart: snapshot.cro.risks_by_band.map((entry: IctCommitteeRiskBandCounts) => ({
                band: entry.band,
                label: controlledLabel(entry.band, translate) ?? entry.band,
                gross: entry.gross_count,
                grossHref: riskBandPath(entry.band, 'gross'),
                net: entry.net_count,
                netHref: riskBandPath(entry.band, 'net'),
            })),
            riskBandChartLabels: { gross: translate('cro.risk_bands_gross'), net: translate('cro.risk_bands_net') },
            riskBandChartSummary: translate('cro.risk_bands_chart_summary', {
                gross: snapshot.cro.risks_by_band.reduce((sum, entry) => sum + entry.gross_count, 0),
                net: snapshot.cro.risks_by_band.reduce((sum, entry) => sum + entry.net_count, 0),
            }),
            riskBandChartBandColumn: translate('top_risks_columns.band'),
            riskBandChartTitle: translate('cro.risk_bands_chart_title'),
            title: translate('cro.title'),
            emptyRiskRanks: Array.from(
                { length: Math.max(0, 10 - snapshot.cro.top_risks.length) },
                (_, index) => snapshot.cro.top_risks.length + index + 1,
            ),
            emptyVendorRanks: Array.from(
                { length: Math.max(0, 5 - snapshot.cro.top_vendors.length) },
                (_, index) => snapshot.cro.top_vendors.length + index + 1,
            ),
            topRisks: snapshot.cro.top_risks.map((risk) => ({
                grossScore: risk.gross_score,
                href: `/risks/${risk.risk_id}`,
                label: risk.code ?? translate('common:fallbacks.unknown_risk'),
                netBand: controlledLabel(risk.net_band, translate),
                netBandClass: classFor(risk.net_band, NET_BAND_CLASSES),
                netScore: risk.net_score,
                rank: risk.rank,
                statusLabel: controlledLabel(risk.status_label, translate),
                subjectLabel: normalizeLookupLabel(risk.subject_label, translate('common:fallbacks.unknown')),
                threatLabel: normalizeLookupLabel(risk.threat_label, translate('common:fallbacks.unknown_threat')),
                tolerance: controlledLabel(risk.vs_tolerance, translate),
                toleranceClass: classFor(risk.vs_tolerance, TOLERANCE_CLASSES),
            })),
            topRisksColumns: {
                band: translate('top_risks_columns.band'),
                gross: translate('top_risks_columns.gross'),
                id: translate('top_risks_columns.id'),
                net: translate('top_risks_columns.net'),
                rank: translate('top_risks_columns.rank'),
                status: translate('top_risks_columns.status'),
                subject: translate('top_risks_columns.subject'),
                threat: translate('top_risks_columns.threat'),
                tolerance: translate('top_risks_columns.tolerance'),
            },
            topRisksTitle: translate('cro.top_risks_title'),
            topVendors: snapshot.cro.top_vendors.map((vendor) => ({
                cifProcessCount: vendor.cif_process_count,
                href: `/vendors/${vendor.vendor_id}`,
                name: vendor.name || translate('common:fallbacks.unknown_vendor'),
                rank: vendor.rank,
                tier: controlledLabel(vendor.tier, translate) ?? vendor.tier,
                tierClass: classFor(vendor.tier, TIER_CLASSES),
            })),
            topVendorsColumns: {
                cifProcesses: translate('top_vendors_columns.cif_processes'),
                rank: translate('top_vendors_columns.rank'),
                tier: translate('top_vendors_columns.tier'),
                vendor: translate('top_vendors_columns.vendor'),
            },
            topVendorsTitle: translate('cro.top_vendors_title'),
        },
        roiReadiness: {
            overallLabel: translate('roi.overall'),
            overallValue:
                snapshot.roi_readiness.overall_readiness_pct === null
                    ? '—'
                    : `${snapshot.roi_readiness.overall_readiness_pct} %`,
            subtitle: translate('roi.subtitle'),
            templates: buildRoiTemplates(snapshot, locale),
            title: translate('roi.title'),
            totalGapsLabel: translate('roi.total_gaps'),
            totalGapsValue: snapshot.roi_readiness.total_gap_row_count,
        },
    };

    return {
        ...presentation,
        sections: [
            { key: 'dashboard', presentation: presentation.dashboard },
            { key: 'executiveSummary', presentation: presentation.executiveSummary },
            { key: 'roiReadiness', presentation: presentation.roiReadiness },
        ],
    };
}
