import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProviderWithReady } from '@test/authBootstrap';
import {
    assetBandStyle,
    heatmapCellFill,
    metricDrilldownPath,
    migrationCellFill,
    narrativeParams,
    netBandStyle,
    riskBandChartRows,
    stateTileDrilldownPath,
    tierStyle,
    toleranceStyle,
} from '@/pages/ictRegisterCommittee/committeePresentation';
import type { IctCommittee } from '@/types/ictRegisterCommittee';

const getCommittee = vi.fn();

vi.mock('@/services/ictRegisterCommitteeApi', () => ({
    ictRegisterCommitteeApi: {
        getCommittee: (...args: unknown[]) => getCommittee(...args),
    },
}));

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
                material_risk_count: 1,
                risks_above_tolerance_count: 3,
                accepted_above_tolerance_count: 1,
                cif_without_bcm_count: 3,
                open_dq_finding_count: 23,
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

    it('maps the exact-match conditional-formatting fills (CRIT_N, TOL, TIER_C)', () => {
        // Inventory §2.4 CRIT_N hexes, verbatim.
        expect(netBandStyle('Nízké')).toEqual({ backgroundColor: '#C6EFCE', color: '#006100' });
        expect(netBandStyle('Střední')).toEqual({ backgroundColor: '#FFEB9C', color: '#9C6500' });
        expect(netBandStyle('Vysoké')).toEqual({ backgroundColor: '#FCE4D6', color: '#C55A11' });
        expect(netBandStyle('Kritické')).toEqual({ backgroundColor: '#FFC7CE', color: '#9C0006' });
        expect(netBandStyle(null)).toBeNull();

        expect(toleranceStyle('V toleranci')).toEqual({ backgroundColor: '#C6EFCE', color: '#006100' });
        expect(toleranceStyle('NAD TOLERANCI')).toEqual({ backgroundColor: '#FFC7CE', color: '#9C0006' });

        expect(tierStyle('Kritický dodavatel')).toEqual({ backgroundColor: '#FFC7CE', color: '#9C0006' });
        expect(tierStyle('Významný dodavatel')).toEqual({ backgroundColor: '#FCE4D6', color: '#C55A11' });
        expect(tierStyle('Standardní dodavatel')).toEqual({ backgroundColor: '#C6EFCE', color: '#006100' });

        // Asset criticality bands reuse the CRIT_N palette on the CZ feminine labels.
        expect(assetBandStyle('Kritická')).toEqual({ backgroundColor: '#FFC7CE', color: '#9C0006' });
    });

    it('drills every dashboard tile down to the register view behind it', () => {
        // Plain register counts land on the register pages...
        expect(stateTileDrilldownPath('process_count')).toBe('/processes');
        expect(stateTileDrilldownPath('asset_count')).toBe('/assets');
        expect(stateTileDrilldownPath('process_asset_link_count')).toBe('/assets');
        expect(stateTileDrilldownPath('vendor_count')).toBe('/vendors');
        expect(stateTileDrilldownPath('direct_process_vendor_link_count')).toBe('/vendors');
        expect(stateTileDrilldownPath('contracts_in_roi_scope_count')).toBe('/vendors');
        expect(stateTileDrilldownPath('sub_outsourcing_link_count')).toBe('/vendors');
        // ...and the DQ-equivalent tiles land on the DQ page filtered to their check.
        expect(stateTileDrilldownPath('assets_pending_review_count')).toBe(
            '/ict-register/data-quality?check=DQ-09'
        );
        expect(stateTileDrilldownPath('assets_without_data_classification_count')).toBe(
            '/ict-register/data-quality?check=DQ-46'
        );
        expect(stateTileDrilldownPath('top_tier_vendors_without_orderly_exit_count')).toBe(
            '/ict-register/data-quality?check=DQ-49'
        );

        expect(metricDrilldownPath('cif_process_count')).toBe('/processes');
        expect(metricDrilldownPath('processes_without_impact_assessment_count')).toBe(
            '/ict-register/data-quality?check=DQ-04'
        );
        expect(metricDrilldownPath('critical_asset_count')).toBe('/assets');
        expect(metricDrilldownPath('critical_vendor_count')).toBe('/vendors');
        expect(metricDrilldownPath('risks_above_tolerance_count')).toBe('/risks');
        expect(metricDrilldownPath('open_dq_finding_count')).toBe(
            '/ict-register/data-quality?status=findings'
        );
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
    it('renders both sheets: tiles, matrices, tables, narratives, and drill-downs', async () => {
        getCommittee.mockResolvedValue(samplePayload());

        const { IctRegisterCommitteePage } = await import('@/pages/IctRegisterCommitteePage');
        render(
            <MemoryRouter>
                <AuthProviderWithReady>
                    <ThemeProvider>
                        <IctRegisterCommitteePage />
                    </ThemeProvider>
                </AuthProviderWithReady>
            </MemoryRouter>
        );

        // 16_Dashboard register-state tiles carry their values and drill down.
        expect(await screen.findByTestId('committee-state-process_count')).toHaveTextContent('148');
        expect(screen.getByTestId('committee-state-vendor_count')).toHaveTextContent('30');
        const reviewTile = screen.getByTestId('committee-state-assets_pending_review_count');
        expect(reviewTile).toHaveTextContent('36');
        expect(reviewTile.closest('a')).toHaveAttribute(
            'href',
            '/ict-register/data-quality?check=DQ-09'
        );

        // Key-metric rows show the live value plus the static texts (EN).
        const cifRow = screen.getByTestId('committee-metric-cif_process_count');
        expect(cifRow).toHaveTextContent('79');
        expect(cifRow).toHaveTextContent('Critical or important functions (DORA art. 3(22))');
        expect(screen.getByTestId('committee-metric-open_dq_finding_count')).toHaveTextContent('23');

        // CRO KPI strip.
        expect(screen.getByTestId('committee-kpi-risk_count')).toHaveTextContent('8');
        expect(screen.getByTestId('committee-kpi-accepted_above_tolerance_count')).toHaveTextContent('1');

        // Heatmap renders the full 5×5 grid in probability 5..1 order.
        expect(screen.getByTestId('committee-heatmap-cell-5-5')).toHaveTextContent('2');
        expect(screen.getByTestId('committee-heatmap-cell-1-1')).toHaveTextContent('0');

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
            'CIF functions: 79 of 148 processes; with BCM evidence: 76'
        );
        expect(screen.getByTestId('committee-narrative-a38')).toHaveTextContent(
            'P_Tolerance = 39'
        );

        // The two aggregate charts are staged.
        expect(screen.getByTestId('committee-chart-assets')).toBeInTheDocument();
        expect(screen.getByTestId('committee-chart-risk-bands')).toBeInTheDocument();

        // The workbook's nav-link chrome maps to in-app navigation.
        expect(screen.getByTestId('committee-nav-dq')).toHaveAttribute(
            'href',
            '/ict-register/data-quality'
        );
    });
});
