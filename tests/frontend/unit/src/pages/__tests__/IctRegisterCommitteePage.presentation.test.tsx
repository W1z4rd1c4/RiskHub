import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProviderWithReady } from '@test/authBootstrap';
import { parseAssetSemanticFilters } from '@/pages/shared/ictRegisterSemanticFilters';
import {
    heatmapCellFill,
    heatmapDrilldownPath,
    kpiDrilldownPath,
    localizeRegisterRowLabel,
    metricDrilldownPath,
    migrationCellFill,
    migrationDrilldownPath,
    narrativeParams,
    netBandStyle,
    riskBandChartRows,
    riskBandDrilldownPath,
    assetCriticalityDrilldownPath,
    roiGapRoutePath,
    stateTileDrilldownPath,
    tierStyle,
    toleranceStyle,
} from '@/pages/ictRegisterCommittee/committeePresentation';
import type { IctCommittee, IctRoiTemplateReadiness } from '@/types/ictRegisterCommittee';

const getCommittee = vi.fn();

vi.mock('@/services/ictRegisterCommitteeApi', () => ({
    ictRegisterCommitteeApi: {
        getCommittee: (...args: unknown[]) => getCommittee(...args),
    },
}));

import { IctRegisterCommitteePage } from '@/pages/IctRegisterCommitteePage';

function roiTemplate(overrides: Partial<IctRoiTemplateReadiness>): IctRoiTemplateReadiness {
    return {
        code: 'B_06.01',
        name_en: 'Functions identification',
        name_cs: 'Určení funkcí',
        feed: 'processes',
        gate: 'presence',
        coverage: 'full',
        row_count: 0,
        required_field_count: 0,
        populated_field_count: 0,
        readiness_pct: null,
        gap_row_count: 0,
        gap_rows: [],
        ...overrides,
    };
}

function samplePayload(): IctCommittee {
    return {
        dashboard: {
            register_state: {
                process_count: 148,
                asset_count: 183,
                process_asset_link_count: 1000,
                vendor_count: 30,
                assets_pending_review_count: 36,
                direct_process_vendor_link_count: 358,
                contracts_in_roi_scope_count: 1,
                sub_outsourcing_link_count: 0,
                assets_without_data_classification_count: 182,
                top_tier_vendors_without_orderly_exit_count: 25,
            },
            key_metrics: {
                cif_process_count: 79,
                processes_without_impact_assessment_count: 148,
                critical_asset_count: 12,
                critical_vendor_count: 26,
                risks_above_tolerance_count: 3,
                open_dq_finding_count: 23,
            },
        },
        cro: {
            kpi: {
                risk_count: 8,
                material_risk_count: 0,
                risks_above_tolerance_count: 3,
                accepted_above_tolerance_count: 1,
                cif_without_bcm_count: 3,
                open_dq_finding_count: 23,
                material_risk_count_production_inert: true,
                material_risk_count_production_inert_reason:
                    'The app Risk register tracks no materiality flag; the loader maps it empty, so this KPI cannot count on production data.',
            },
            heatmap: {
                rows: [5, 4, 3, 2, 1].map((probability) => ({
                    probability,
                    cells: probability === 5 ? [0, 1, 0, 0, 2] : [0, 0, 0, 0, 0],
                })),
            },
            migration_matrix: {
                rows: [
                    { gross_band: 'Nízké', cells: [1, 0, 0, 0] },
                    { gross_band: 'Střední', cells: [0, 2, 0, 0] },
                    { gross_band: 'Vysoké', cells: [0, 1, 1, 0] },
                    { gross_band: 'Kritické', cells: [0, 0, 1, 2] },
                ],
            },
            top_risks: [
                {
                    rank: 1,
                    risk_id: 7,
                    code: 'RIZ-007',
                    subject_label: 'Správa pojistných smluv',
                    threat_label: 'Ransomware',
                    gross_score: 25,
                    net_score: 25,
                    net_band: 'Vysoké',
                    vs_tolerance: 'NAD TOLERANCI',
                    status_label: 'Akceptováno',
                },
                {
                    rank: 2,
                    risk_id: 3,
                    code: 'RIZ-003',
                    subject_label: 'Veris',
                    threat_label: null,
                    gross_score: 4,
                    net_score: 2,
                    net_band: 'Nízké',
                    vs_tolerance: 'V toleranci',
                    status_label: null,
                },
            ],
            top_vendors: [
                {
                    rank: 1,
                    vendor_id: 4,
                    name: 'BIZ DATA',
                    cif_process_count: 12,
                    tier: 'Kritický dodavatel',
                },
            ],
            narratives: {
                cif_process_count: 79,
                process_count: 148,
                cif_with_bcm_count: 76,
                critical_vendor_count: 26,
                critical_vendors_with_functional_exit_count: 1,
                critical_vendors_with_identifier_count: 26,
                tolerance: 39,
                risks_above_tolerance_count: 3,
                accepted_above_tolerance_count: 1,
                sub_outsourcing_link_count: 0,
                vendors_in_sub_role_count: 0,
            },
            assets_by_criticality: [
                { band: 'Nízká', count: 20 },
                { band: 'Střední', count: 60 },
                { band: 'Vysoká', count: 91 },
                { band: 'Kritická', count: 12 },
            ],
            risks_by_band: [
                { band: 'Nízké', gross_count: 1, net_count: 3 },
                { band: 'Střední', gross_count: 2, net_count: 2 },
                { band: 'Vysoké', gross_count: 2, net_count: 2 },
                { band: 'Kritické', gross_count: 3, net_count: 1 },
            ],
        },
        roi_readiness: {
            templates: [
                roiTemplate({
                    code: 'B_01.01',
                    name_en: 'Entity maintaining the register',
                    name_cs: 'Entita vedoucí registr',
                    feed: 'entity',
                    gate: 'documentary',
                    coverage: 'documentary',
                }),
                roiTemplate({
                    code: 'B_06.01',
                    row_count: 148,
                    required_field_count: 1332,
                    populated_field_count: 1184,
                    readiness_pct: 88.9,
                    gap_row_count: 148,
                    gap_rows: [
                        {
                            entity_type: 'process',
                            entity_id: 12,
                            label: 'F12 — Správa pojistných smluv',
                            route_entity_type: 'process',
                            route_entity_id: 12,
                            missing: [
                                { key: 'licensed_activity', code: 'B_06.01.0020' },
                                { key: 'rto_hours', code: 'B_06.01.0080' },
                            ],
                        },
                    ],
                }),
                roiTemplate({
                    code: 'B_05.01',
                    name_en: 'ICT third-party service providers',
                    name_cs: 'Poskytovatelé',
                    feed: 'vendors',
                    gate: 'presence',
                    coverage: 'partial',
                    row_count: 30,
                    required_field_count: 180,
                    populated_field_count: 180,
                    readiness_pct: 100.0,
                }),
                roiTemplate({
                    code: 'B_02.01',
                    name_en: 'Contractual arrangements — general information',
                    name_cs: 'Smluvní ujednání',
                    feed: 'contracts',
                    gate: 'roi_scope',
                    coverage: 'partial',
                    row_count: 0,
                    readiness_pct: null,
                }),
            ],
            overall_readiness_pct: 90.4,
            total_gap_row_count: 148,
        },
    };
}

describe('ICT Risk Committee presentation helpers', () => {
    it('interpolates the heatmap ColorScale anchors (0 -> FFFFFF, 2 -> FFEB84, 4 -> F8696B)', () => {
        // Inventory §2.2: 3-point ColorScale; zero cells stay unfilled.
        expect(heatmapCellFill(0)).toBeNull();
        expect(heatmapCellFill(1)).toBe('#FFF5C2'); // midpoint FFFFFF -> FFEB84
        expect(heatmapCellFill(2)).toBe('#FFEB84');
        expect(heatmapCellFill(3)).toBe('#FCAA78'); // midpoint FFEB84 -> F8696B
        expect(heatmapCellFill(4)).toBe('#F8696B');
        expect(heatmapCellFill(9)).toBe('#F8696B'); // clamps past the max anchor
    });

    it('interpolates the migration ColorScale with its max anchor at 5', () => {
        // Inventory §2.3: same colors, num 5 -> F8696B.
        expect(migrationCellFill(0)).toBeNull();
        expect(migrationCellFill(2)).toBe('#FFEB84');
        expect(migrationCellFill(5)).toBe('#F8696B');
        expect(migrationCellFill(7)).toBe('#F8696B');
    });

    it('maps the exact-match status pills onto the semantic RAG tokens (CRIT_N, TOL, TIER_C)', () => {
        // FR-P5-1: migrated off the Excel pastels onto the semantic status tokens.
        // The four Excel bands collapse onto the three-token RAG scale — Střední +
        // Vysoké both read amber (--warning); Kritické reads red (--destructive).
        const success = {
            backgroundColor: 'hsl(var(--success))',
            color: 'hsl(var(--success-foreground))',
        };
        const warning = {
            backgroundColor: 'hsl(var(--warning))',
            color: 'hsl(var(--warning-foreground))',
        };
        const destructive = {
            backgroundColor: 'hsl(var(--destructive))',
            color: 'hsl(var(--destructive-foreground))',
        };

        expect(netBandStyle('Nízké')).toEqual(success);
        expect(netBandStyle('Střední')).toEqual(warning);
        expect(netBandStyle('Vysoké')).toEqual(warning);
        expect(netBandStyle('Kritické')).toEqual(destructive);
        expect(netBandStyle(null)).toBeNull();

        expect(toleranceStyle('V toleranci')).toEqual(success);
        expect(toleranceStyle('NAD TOLERANCI')).toEqual(destructive);

        expect(tierStyle('Kritický dodavatel')).toEqual(destructive);
        expect(tierStyle('Významný dodavatel')).toEqual(warning);
        expect(tierStyle('Standardní dodavatel')).toEqual(success);
    });

    it('drills every dashboard tile down to the register view behind it', () => {
        // Plain register counts land on the register pages...
        expect(stateTileDrilldownPath('process_count')).toBe('/processes');
        expect(stateTileDrilldownPath('asset_count')).toBe('/assets?committee_scope=true');
        expect(stateTileDrilldownPath('process_asset_link_count')).toBe('/assets?committee_scope=true&has_process_link=true');
        expect(stateTileDrilldownPath('vendor_count')).toBe('/vendors?committee_scope=true');
        expect(stateTileDrilldownPath('direct_process_vendor_link_count')).toBe(
            '/vendors?committee_scope=true&has_direct_process_link=true',
        );
        expect(stateTileDrilldownPath('contracts_in_roi_scope_count')).toBe('/vendors?committee_scope=true&has_roi_contract=true');
        expect(stateTileDrilldownPath('sub_outsourcing_link_count')).toBe('/vendors?committee_scope=true&has_sub_outsourcing=true');
        // ...and the DQ-equivalent tiles land on the DQ page filtered to their check.
        expect(stateTileDrilldownPath('assets_pending_review_count')).toBe('/ict-register/data-quality?check=DQ-09');
        expect(stateTileDrilldownPath('assets_without_data_classification_count')).toBe(
            '/ict-register/data-quality?check=DQ-46',
        );
        expect(stateTileDrilldownPath('top_tier_vendors_without_orderly_exit_count')).toBe(
            '/ict-register/data-quality?check=DQ-49',
        );

        expect(metricDrilldownPath('cif_process_count')).toBe('/processes?cif=true');
        expect(metricDrilldownPath('processes_without_impact_assessment_count')).toBe(
            '/ict-register/data-quality?check=DQ-04',
        );
        expect(metricDrilldownPath('critical_asset_count')).toBe('/assets?committee_scope=true&criticality=critical');
        expect(metricDrilldownPath('critical_vendor_count')).toBe('/vendors?committee_scope=true&tier=critical');
        expect(metricDrilldownPath('risks_above_tolerance_count')).toBe('/risks?committee_scope=true&ict_linked=true&above_tolerance=true');
        expect(metricDrilldownPath('open_dq_finding_count')).toBe('/ict-register/data-quality?status=findings');
    });

    it('drills every CRO KPI tile down to the surface behind it', () => {
        // The DQ-equivalent tiles land on the DQ page (I7 ≡ DQ-05; K7 = the
        // findings tally); the risk-fed tiles land on the risk register.
        expect(kpiDrilldownPath('risk_count')).toBe('/risks?committee_scope=true&ict_linked=true');
        expect(kpiDrilldownPath('material_risk_count')).toBe('/risks?committee_scope=true&ict_linked=true');
        expect(kpiDrilldownPath('risks_above_tolerance_count')).toBe('/risks?committee_scope=true&ict_linked=true&above_tolerance=true');
        expect(kpiDrilldownPath('accepted_above_tolerance_count')).toBe(
            '/risks?committee_scope=true&ict_linked=true&above_tolerance=true&response=acceptance',
        );
        expect(kpiDrilldownPath('cif_without_bcm_count')).toBe('/ict-register/data-quality?check=DQ-05');
        expect(kpiDrilldownPath('open_dq_finding_count')).toBe('/ict-register/data-quality?status=findings');
    });

    it('maps every matrix coordinate and chart bar to its semantic register filter', () => {
        expect(heatmapDrilldownPath(5, 3)).toBe('/risks?committee_scope=true&ict_linked=true&gross_probability=5&gross_impact=3');
        expect(migrationDrilldownPath('Vysoké', 'Střední')).toBe(
            '/risks?committee_scope=true&ict_linked=true&gross_band=Vysok%C3%A9&net_band=St%C5%99edn%C3%AD',
        );
        expect(assetCriticalityDrilldownPath('Kritická')).toBe('/assets?committee_scope=true&criticality=critical');
        expect(riskBandDrilldownPath('Kritické', 'gross')).toBe('/risks?committee_scope=true&ict_linked=true&gross_band=Kritick%C3%A9');
        expect(riskBandDrilldownPath('Nízké', 'net')).toBe('/risks?committee_scope=true&ict_linked=true&net_band=N%C3%ADzk%C3%A9');
    });

    it('feeds metric and chart Asset drilldowns into the canonical backend filter vocabulary', () => {
        for (const path of [
            metricDrilldownPath('critical_asset_count'),
            assetCriticalityDrilldownPath('Kritická'),
            assetCriticalityDrilldownPath('critical'),
        ]) {
            const url = new URL(path, 'http://riskhub.test');
            expect(parseAssetSemanticFilters(url.searchParams).criticality).toBe('critical');
            expect(url.searchParams.get('criticality')).toBe('critical');
        }
    });

    it('anchors RoI gap rows on their register detail pages (the DQ route shape)', () => {
        expect(
            roiGapRoutePath({
                entity_type: 'process',
                entity_id: 12,
                label: 'F12',
                route_entity_type: 'process',
                route_entity_id: 12,
                missing: [],
            }),
        ).toBe('/processes/12');
        expect(
            roiGapRoutePath({
                entity_type: 'contract',
                entity_id: 3,
                label: 'SML-1',
                route_entity_type: 'vendor',
                route_entity_id: 9,
                missing: [],
            }),
        ).toBe('/vendors/9');
        expect(
            roiGapRoutePath({
                entity_type: 'asset_vendor_link',
                entity_id: 4,
                label: 'Veris ↔ BIZ DATA',
                route_entity_type: 'asset',
                route_entity_id: 7,
                missing: [],
            }),
        ).toBe('/assets/7');
        expect(
            roiGapRoutePath({
                entity_type: 'x',
                entity_id: 1,
                label: 'x',
                route_entity_type: 'unknown',
                route_entity_id: 1,
                missing: [],
            }),
        ).toBeNull();
    });

    it('localizes {{unknown_<entity>}} RoI gap-row tokens to the guardrail fallback', () => {
        const t = (key: string) =>
            ({
                'common:fallbacks.unknown_vendor': 'Unknown vendor',
                'common:fallbacks.unknown_sub_outsourcing': 'Unknown sub-outsourcing provider',
            })[key] ?? key;
        expect(localizeRegisterRowLabel('{{unknown_vendor}}', t)).toBe('Unknown vendor');
        expect(localizeRegisterRowLabel('{{unknown_sub_outsourcing}}', t)).toBe('Unknown sub-outsourcing provider');
        // Real business labels pass through untouched.
        expect(localizeRegisterRowLabel('F12 — Správa pojistných smluv', t)).toBe('F12 — Správa pojistných smluv');
    });

    it('stages the gross-vs-net chart rows from the band aggregate', () => {
        const rows = riskBandChartRows(samplePayload().cro.risks_by_band);
        expect(rows).toEqual([
            { band: 'Nízké', gross: 1, net: 3 },
            { band: 'Střední', gross: 2, net: 2 },
            { band: 'Vysoké', gross: 2, net: 2 },
            { band: 'Kritické', gross: 3, net: 1 },
        ]);
    });

    it('exposes the five narrative sentences as interpolation params', () => {
        const params = narrativeParams(samplePayload().cro.narratives);
        expect(params.a34).toEqual({ cif: 79, total: 148, bcm: 76 });
        expect(params.a35).toEqual({ critical: 26, exit: 1, legal: 26 });
        expect(params.a36).toEqual({ tolerance: 39, above: 3, accepted: 1 });
        expect(params.a37).toEqual({ links: 0, subRole: 0 });
        expect(params.a38).toEqual({ tolerance: 39 });
    });
});

describe('IctRegisterCommitteePage', () => {
    function renderPage() {
        render(
            <MemoryRouter>
                <AuthProviderWithReady>
                    <ThemeProvider>
                        <IctRegisterCommitteePage />
                    </ThemeProvider>
                </AuthProviderWithReady>
            </MemoryRouter>,
        );
    }

    it('renders both sheets: tiles, matrices, tables, narratives, and drill-downs', async () => {
        getCommittee.mockResolvedValue(samplePayload());
        renderPage();

        // 16_Dashboard register-state tiles carry their values and drill down.
        expect(await screen.findByTestId('committee-state-process_count')).toHaveTextContent('148');
        expect(screen.getByTestId('committee-state-vendor_count')).toHaveTextContent('30');
        const reviewTile = screen.getByTestId('committee-state-assets_pending_review_count');
        expect(reviewTile).toHaveTextContent('36');
        expect(reviewTile.closest('a')).toHaveAttribute('href', '/ict-register/data-quality?check=DQ-09');

        // Key-metric rows show the live value plus the static texts (EN).
        const cifRow = screen.getByTestId('committee-metric-cif_process_count');
        expect(cifRow).toHaveTextContent('79');
        expect(cifRow).toHaveTextContent('Critical or important functions (DORA art. 3(22))');
        expect(screen.getByTestId('committee-metric-open_dq_finding_count')).toHaveTextContent('23');

        // CRO KPI strip; tiles drill down (I7 lands on its DQ check).
        expect(screen.getByTestId('committee-kpi-risk_count')).toHaveTextContent('8');
        expect(screen.getByTestId('committee-kpi-accepted_above_tolerance_count')).toHaveTextContent('1');
        expect(screen.getByTestId('committee-kpi-cif_without_bcm_count').closest('a')).toHaveAttribute(
            'href',
            '/ict-register/data-quality?check=DQ-05',
        );

        // Heatmap renders the full 5×5 grid in probability 5..1 order, and its
        // caption states what the app actually plots (gross probability ×
        // gross impact — the loader's mapping of the workbook's subject axis).
        expect(screen.getByTestId('committee-heatmap-cell-5-5')).toHaveTextContent('2');
        expect(screen.getByTestId('committee-heatmap-cell-1-1')).toHaveTextContent('0');
        expect(screen.getByTestId('committee-heatmap')).toHaveTextContent('Gross probability ↓ / Gross impact →');

        // Migration matrix band edges.
        expect(screen.getByTestId('committee-migration-cell-Kritické-Kritické')).toHaveTextContent('2');

        // Top-10 rows drill down to the risk; CF pills carry the band label.
        const topRiskRow = screen.getByTestId('committee-top-risk-1');
        expect(topRiskRow).toHaveTextContent('RIZ-007');
        expect(topRiskRow).toHaveTextContent('Ransomware');
        expect(screen.getByRole('link', { name: /RIZ-007/ })).toHaveAttribute('href', '/risks/7');
        // Blank positions keep their static # labels (ranks 3-10 render empty).
        expect(screen.getByTestId('committee-top-risk-empty-3')).toBeInTheDocument();
        expect(screen.getByTestId('committee-top-risk-empty-10')).toBeInTheDocument();

        // Top-5 vendor concentration drills down to the vendor.
        const topVendorRow = screen.getByTestId('committee-top-vendor-1');
        expect(topVendorRow).toHaveTextContent('BIZ DATA');
        expect(screen.getByRole('link', { name: /BIZ DATA/ })).toHaveAttribute('href', '/vendors/4');
        expect(screen.getByTestId('committee-top-vendor-empty-2')).toBeInTheDocument();

        // Narratives compose the five sentences from the structured values (EN).
        expect(screen.getByTestId('committee-narrative-a34')).toHaveTextContent(
            'CIF functions: 79 of 148 processes; with BCM evidence: 76',
        );
        expect(screen.getByTestId('committee-narrative-a38')).toHaveTextContent('P_Tolerance = 39');

        // The two aggregate charts are staged.
        expect(screen.getByTestId('committee-chart-assets')).toBeInTheDocument();
        expect(screen.getByTestId('committee-chart-risk-bands')).toBeInTheDocument();
        expect(screen.getByTestId('committee-asset-bar-Kritická')).toHaveAttribute(
            'href',
            '/assets?committee_scope=true&criticality=critical',
        );
        expect(screen.getByTestId('committee-risk-bar-gross-Kritické')).toHaveAttribute(
            'href',
            '/risks?committee_scope=true&ict_linked=true&gross_band=Kritick%C3%A9',
        );
        expect(screen.getByTestId('committee-risk-bar-net-Nízké')).toHaveAttribute(
            'href',
            '/risks?committee_scope=true&ict_linked=true&net_band=N%C3%ADzk%C3%A9',
        );

        // The workbook's nav-link chrome maps to in-app navigation.
        expect(screen.getByTestId('committee-nav-dq')).toHaveAttribute('href', '/ict-register/data-quality');
    });

    it('mutes the material KPI as not yet measurable — never a silent 0', async () => {
        getCommittee.mockResolvedValue(samplePayload());
        renderPage();

        const materialTile = await screen.findByTestId('committee-kpi-material_risk_count');
        expect(materialTile).toHaveTextContent('—');
        expect(materialTile).not.toHaveTextContent(/\b0\b/);
        expect(materialTile).toHaveTextContent('Not yet measurable');
    });

    it('renders the RoI-readiness element: per-template rows, coverage badges, gaps', async () => {
        getCommittee.mockResolvedValue(samplePayload());
        renderPage();

        const section = await screen.findByTestId('committee-roi');
        expect(section).toHaveTextContent('90.4');
        expect(section).toHaveTextContent('148'); // total rows with gaps

        // A computed template row: code, official EN name, % and row count.
        const functions = screen.getByTestId('committee-roi-template-B_06.01');
        expect(functions).toHaveTextContent('B_06.01');
        expect(functions).toHaveTextContent('Functions identification');
        expect(functions).toHaveTextContent('88.9');
        expect(functions).toHaveTextContent('Full');

        // A documentary template renders distinctly: badge + note, no percent.
        const entity = screen.getByTestId('committee-roi-template-B_01.01');
        expect(entity).toHaveTextContent('Documentary');
        expect(entity).not.toHaveTextContent('%');

        // A gated template with no feeding rows shows the empty affordance.
        expect(screen.getByTestId('committee-roi-template-B_02.01')).toHaveTextContent('No feeding rows');

        // The gap drill-down expands to the rows and their missing field codes,
        // linking each row to its register detail page.
        fireEvent.click(screen.getByTestId('committee-roi-toggle-B_06.01'));
        const gaps = screen.getByTestId('committee-roi-gaps-B_06.01');
        expect(gaps).toHaveTextContent('F12 — Správa pojistných smluv');
        expect(gaps).toHaveTextContent('B_06.01.0020');
        expect(gaps).toHaveTextContent('B_06.01.0080');
        expect(screen.getByRole('link', { name: /F12 — Správa pojistných smluv/ })).toHaveAttribute(
            'href',
            '/processes/12',
        );
    });

    it('renders a tokenized RoI gap-row label as the localized Unknown fallback, never the token', async () => {
        const payload = samplePayload();
        const b0501 = payload.roi_readiness.templates.find((tpl) => tpl.code === 'B_05.01')!;
        b0501.readiness_pct = 50;
        b0501.gap_row_count = 1;
        b0501.gap_rows = [
            {
                entity_type: 'vendor',
                entity_id: 7,
                label: '{{unknown_vendor}}',
                route_entity_type: 'vendor',
                route_entity_id: 7,
                missing: [{ key: 'legal_name', code: null }],
            },
        ];
        getCommittee.mockResolvedValue(payload);
        renderPage();

        fireEvent.click(await screen.findByTestId('committee-roi-toggle-B_05.01'));
        const gaps = screen.getByTestId('committee-roi-gaps-B_05.01');
        expect(gaps).toHaveTextContent('Unknown vendor');
        expect(gaps).not.toHaveTextContent('{{unknown_vendor}}');
    });
});
