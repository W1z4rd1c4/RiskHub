import type {
    IctCommitteeCroKpi,
    IctCommitteeKeyMetrics,
    IctCommitteeNarratives,
    IctCommitteeRegisterState,
    IctCommitteeRiskBandCounts,
    IctRoiGapRow,
} from '@/types/ictRegisterCommittee';

// Presentation helpers for the ICT Risk Committee page (issue #51). The five
// conditional-formatting blocks of 18_CRO_přehled (tile inventory §5(1)) are
// presentation rules keyed on cell values; this module carries their
// semantics as data — the two 3-point ColorScales and the three exact-match
// fill sets, hexes verbatim from the builder (ui.py:184-197).

type CellStyle = { backgroundColor: string; color: string };

// 3-point ColorScale anchors: num 0 -> FFFFFF, num 2 -> FFEB84, num max ->
// F8696B (max 4 on the heatmap B12:F16, max 5 on the migration I12:L15).
const SCALE_LOW: [number, number, number] = [0xff, 0xff, 0xff];
const SCALE_MID: [number, number, number] = [0xff, 0xeb, 0x84];
const SCALE_HIGH: [number, number, number] = [0xf8, 0x69, 0x6b];
const SCALE_MID_ANCHOR = 2;

function mixChannel(from: number, to: number, t: number): number {
    return Math.round(from + (to - from) * t);
}

function mix(from: [number, number, number], to: [number, number, number], t: number): string {
    const channels = from.map((channel, index) => mixChannel(channel, to[index], t));
    return `#${channels.map((channel) => channel.toString(16).toUpperCase().padStart(2, '0')).join('')}`;
}

function colorScaleFill(value: number, maxAnchor: number): string | null {
    // Zero cells stay unfilled — the workbook's white bottom anchor reads as
    // "no fill" on the app surface.
    if (value <= 0) return null;
    if (value <= SCALE_MID_ANCHOR) {
        return mix(SCALE_LOW, SCALE_MID, value / SCALE_MID_ANCHOR);
    }
    if (value >= maxAnchor) {
        return mix(SCALE_MID, SCALE_HIGH, 1);
    }
    return mix(SCALE_MID, SCALE_HIGH, (value - SCALE_MID_ANCHOR) / (maxAnchor - SCALE_MID_ANCHOR));
}

/** Heatmap ColorScale (inventory §2.2): 0 -> FFFFFF, 2 -> FFEB84, 4 -> F8696B. */
export function heatmapCellFill(value: number): string | null {
    return colorScaleFill(value, 4);
}

/** Migration ColorScale (inventory §2.3): same colors, max anchor at 5. */
export function migrationCellFill(value: number): string | null {
    return colorScaleFill(value, 5);
}

// Exact-match fills, hexes verbatim (ui.py:186-187): the standard Excel
// good/neutral/bad trio plus the Vysoké orange.
const FILL_GREEN: CellStyle = { backgroundColor: '#C6EFCE', color: '#006100' };
const FILL_YELLOW: CellStyle = { backgroundColor: '#FFEB9C', color: '#9C6500' };
const FILL_ORANGE: CellStyle = { backgroundColor: '#FCE4D6', color: '#C55A11' };
const FILL_RED: CellStyle = { backgroundColor: '#FFC7CE', color: '#9C0006' };

// CRIT_N (G21:G30): the net-band pill fills.
const NET_BAND_STYLES: Record<string, CellStyle> = {
    Nízké: FILL_GREEN,
    Střední: FILL_YELLOW,
    Vysoké: FILL_ORANGE,
    Kritické: FILL_RED,
};

// TOL (H21:H30): V toleranci green, NAD TOLERANCI red (ui.py:196).
const TOLERANCE_STYLES: Record<string, CellStyle> = {
    'V toleranci': FILL_GREEN,
    'NAD TOLERANCI': FILL_RED,
};

// TIER_C (N21:N25): Kritický red, Významný orange, Standardní green (ui.py:190-192).
const TIER_STYLES: Record<string, CellStyle> = {
    'Kritický dodavatel': FILL_RED,
    'Významný dodavatel': FILL_ORANGE,
    'Standardní dodavatel': FILL_GREEN,
};

export function netBandStyle(band: string | null): CellStyle | null {
    return band ? (NET_BAND_STYLES[band] ?? null) : null;
}

export function toleranceStyle(vsTolerance: string | null): CellStyle | null {
    return vsTolerance ? (TOLERANCE_STYLES[vsTolerance] ?? null) : null;
}

export function tierStyle(tier: string | null): CellStyle | null {
    return tier ? (TIER_STYLES[tier] ?? null) : null;
}

// ---------------------------------------------------------------------------
// Drill-downs: every figure links to the register view that produced it.
// Plain register counts land on the register pages; the DQ-equivalent tiles
// (inventory §4: rows 11/15/16 ≡ DQ-09/46/49, metric row 20 ≡ DQ-04, CRO I7
// ≡ DQ-05) land on the DQ page deep-linked to their check; the two
// open-findings tiles land on the DQ findings filter.
// ---------------------------------------------------------------------------

const DQ_PAGE = '/ict-register/data-quality';

export function dqCheckPath(checkId: string): string {
    return `${DQ_PAGE}?check=${checkId}`;
}

export const DQ_FINDINGS_PATH = `${DQ_PAGE}?status=findings`;

const STATE_TILE_PATHS: Record<keyof IctCommitteeRegisterState, string> = {
    process_count: '/processes',
    asset_count: '/assets',
    process_asset_link_count: '/assets',
    vendor_count: '/vendors',
    assets_pending_review_count: dqCheckPath('DQ-09'),
    direct_process_vendor_link_count: '/vendors',
    contracts_in_roi_scope_count: '/vendors',
    sub_outsourcing_link_count: '/vendors',
    assets_without_data_classification_count: dqCheckPath('DQ-46'),
    top_tier_vendors_without_orderly_exit_count: dqCheckPath('DQ-49'),
};

const METRIC_PATHS: Record<keyof IctCommitteeKeyMetrics, string> = {
    cif_process_count: '/processes',
    processes_without_impact_assessment_count: dqCheckPath('DQ-04'),
    critical_asset_count: '/assets',
    critical_vendor_count: '/vendors',
    risks_above_tolerance_count: '/risks',
    open_dq_finding_count: DQ_FINDINGS_PATH,
};

// CRO KPI strip (§2.1): I7 ≡ DQ-05 lands on its check, K7 on the findings
// filter, the risk-fed tiles on the risk register.
export type CommitteeKpiKey = keyof Pick<
    IctCommitteeCroKpi,
    | 'risk_count'
    | 'material_risk_count'
    | 'risks_above_tolerance_count'
    | 'accepted_above_tolerance_count'
    | 'cif_without_bcm_count'
    | 'open_dq_finding_count'
>;

const KPI_PATHS: Record<CommitteeKpiKey, string> = {
    risk_count: '/risks',
    material_risk_count: '/risks',
    risks_above_tolerance_count: '/risks',
    accepted_above_tolerance_count: '/risks',
    cif_without_bcm_count: dqCheckPath('DQ-05'),
    open_dq_finding_count: DQ_FINDINGS_PATH,
};

export function stateTileDrilldownPath(key: keyof IctCommitteeRegisterState): string {
    return STATE_TILE_PATHS[key];
}

export function metricDrilldownPath(key: keyof IctCommitteeKeyMetrics): string {
    return METRIC_PATHS[key];
}

export function kpiDrilldownPath(key: CommitteeKpiKey): string {
    return KPI_PATHS[key];
}

// RoI gap rows anchor on a routable register detail page, the DQ route shape
// (contracts and sub-outsourcing rows anchor on their owning Vendor; link
// rows anchor on their Asset end).
const ROI_ROUTE_PATHS: Record<string, (id: number) => string> = {
    process: (id) => `/processes/${id}`,
    asset: (id) => `/assets/${id}`,
    vendor: (id) => `/vendors/${id}`,
};

export function roiGapRoutePath(row: IctRoiGapRow): string | null {
    const build = ROI_ROUTE_PATHS[row.route_entity_type];
    return build ? build(row.route_entity_id) : null;
}

export function topRiskPath(riskId: number): string {
    return `/risks/${riskId}`;
}

export function topVendorPath(vendorId: number): string {
    return `/vendors/${vendorId}`;
}

// ---------------------------------------------------------------------------
// Chart staging (inventory §2.7): the two aggregates feed the two bar charts.
// ---------------------------------------------------------------------------

export interface RiskBandChartRow {
    band: string;
    gross: number;
    net: number;
}

export function riskBandChartRows(entries: IctCommitteeRiskBandCounts[]): RiskBandChartRow[] {
    return entries.map((entry) => ({
        band: entry.band,
        gross: entry.gross_count,
        net: entry.net_count,
    }));
}

// ---------------------------------------------------------------------------
// Narratives (inventory §2.6): interpolation params per sentence; the i18n
// namespace carries the CZ sentences verbatim plus the EN glosses.
// ---------------------------------------------------------------------------

export interface NarrativeParams {
    a34: { cif: number; total: number; bcm: number };
    a35: { critical: number; exit: number; legal: number };
    a36: { tolerance: number; above: number; accepted: number };
    a37: { links: number; subRole: number };
    a38: { tolerance: number };
}

export function narrativeParams(narratives: IctCommitteeNarratives): NarrativeParams {
    return {
        a34: {
            cif: narratives.cif_process_count,
            total: narratives.process_count,
            bcm: narratives.cif_with_bcm_count,
        },
        a35: {
            critical: narratives.critical_vendor_count,
            exit: narratives.critical_vendors_with_functional_exit_count,
            legal: narratives.critical_vendors_with_identifier_count,
        },
        a36: {
            tolerance: narratives.tolerance,
            above: narratives.risks_above_tolerance_count,
            accepted: narratives.accepted_above_tolerance_count,
        },
        a37: {
            links: narratives.sub_outsourcing_link_count,
            subRole: narratives.vendors_in_sub_role_count,
        },
        a38: { tolerance: narratives.tolerance },
    };
}

// Heatmap axes: rows probability 5..1, columns subject value 1..5 (§2.2).
export const HEATMAP_SUBJECT_VALUES = [1, 2, 3, 4, 5] as const;
