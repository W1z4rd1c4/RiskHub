import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProviderWithReady } from '@test/authBootstrap';
import { IctCommitteeSection } from '@/components/dashboard/IctCommitteeSection';
import type { IctCommittee, IctRoiTemplateReadiness } from '@/types/ictRegisterCommittee';

const getCommittee = vi.fn();

vi.mock('@/../node_modules/recharts/lib/index.js', async () => {
    const React = await vi.importActual<typeof import('react')>('react');
    const ChartDataContext = React.createContext<Array<Record<string, unknown>>>([]);
    const passthrough = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children);

    return {
        Bar: ({ shape }: { shape?: React.ElementType }) => {
            const data = React.useContext(ChartDataContext);
            if (!shape) return null;
            return React.createElement(
                'svg',
                null,
                data.map((payload, index) =>
                    React.createElement(shape, {
                        fill: 'currentColor',
                        height: 10,
                        key: `${String(payload.band)}-${index}`,
                        payload,
                        width: 10,
                        x: 0,
                        y: index * 10,
                    }),
                ),
            );
        },
        BarChart: ({ children, data }: { children?: React.ReactNode; data?: Array<Record<string, unknown>> }) =>
            React.createElement(ChartDataContext.Provider, { value: data ?? [] }, children),
        CartesianGrid: passthrough,
        Legend: passthrough,
        ResponsiveContainer: passthrough,
        Tooltip: passthrough,
        XAxis: passthrough,
        YAxis: passthrough,
    };
});

vi.mock('@/services/ictRegisterCommitteeApi', () => ({
    ictRegisterCommitteeApi: {
        getCommittee: (...args: unknown[]) => getCommittee(...args),
    },
}));

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

describe('IctCommitteeSection', () => {
    function LocationProbe() {
        const location = useLocation();
        return <output data-testid="committee-location">{`${location.pathname}${location.search}`}</output>;
    }

    function renderSection() {
        render(
            <MemoryRouter>
                <AuthProviderWithReady>
                    <ThemeProvider>
                        <IctCommitteeSection />
                        <LocationProbe />
                    </ThemeProvider>
                </AuthProviderWithReady>
            </MemoryRouter>,
        );
    }

    it('renders both sheets: tiles, matrices, tables, narratives, and drill-downs', async () => {
        getCommittee.mockResolvedValue(samplePayload());
        renderSection();

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

        const dashboard = screen.getByTestId('committee-dashboard');
        const executiveSummary = screen.getByTestId('committee-cro');
        const roiReadiness = screen.getByTestId('committee-roi');
        expect(dashboard.compareDocumentPosition(executiveSummary) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
        expect(executiveSummary.compareDocumentPosition(roiReadiness) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    });

    it('mutes the material KPI as not yet measurable — never a silent 0', async () => {
        getCommittee.mockResolvedValue(samplePayload());
        renderSection();

        const materialTile = await screen.findByTestId('committee-kpi-material_risk_count');
        expect(materialTile).toHaveTextContent('—');
        expect(materialTile).not.toHaveTextContent(/\b0\b/);
        expect(materialTile).toHaveTextContent('Not yet measurable');
    });

    it('uses the chart payload href for an ordinary in-app click', async () => {
        getCommittee.mockResolvedValue(samplePayload());
        renderSection();

        const shape = await screen.findByTestId('committee-asset-bar-shape-Kritická');
        expect(shape).toHaveAttribute('href', '/assets?committee_scope=true&criticality=critical');

        fireEvent.click(shape);

        expect(screen.getByTestId('committee-location')).toHaveTextContent(
            '/assets?committee_scope=true&criticality=critical',
        );
    });

    it('preserves the chart payload href native behavior for a modified click', async () => {
        getCommittee.mockResolvedValue(samplePayload());
        renderSection();

        const shape = await screen.findByTestId('committee-risk-bar-shape-gross-Kritické');
        expect(shape).toHaveAttribute(
            'href',
            '/risks?committee_scope=true&ict_linked=true&gross_band=Kritick%C3%A9',
        );

        fireEvent.click(shape, { metaKey: true });

        expect(screen.getByTestId('committee-location')).toHaveTextContent(/^\/$/);
    });

    it('activates the chart payload href with Enter', async () => {
        getCommittee.mockResolvedValue(samplePayload());
        renderSection();

        const shape = await screen.findByTestId('committee-risk-bar-shape-gross-Kritické');
        fireEvent.keyDown(shape, { key: 'Enter' });

        expect(screen.getByTestId('committee-location')).toHaveTextContent(
            '/risks?committee_scope=true&ict_linked=true&gross_band=Kritick%C3%A9',
        );
    });

    it('activates the chart payload href with Space', async () => {
        getCommittee.mockResolvedValue(samplePayload());
        renderSection();

        const shape = await screen.findByTestId('committee-risk-bar-shape-net-Nízké');
        fireEvent.keyDown(shape, { key: ' ' });

        expect(screen.getByTestId('committee-location')).toHaveTextContent(
            '/risks?committee_scope=true&ict_linked=true&net_band=N%C3%ADzk%C3%A9',
        );
    });

    it('renders the RoI-readiness element: per-template rows, coverage badges, gaps', async () => {
        getCommittee.mockResolvedValue(samplePayload());
        renderSection();

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
        renderSection();

        fireEvent.click(await screen.findByTestId('committee-roi-toggle-B_05.01'));
        const gaps = screen.getByTestId('committee-roi-gaps-B_05.01');
        expect(gaps).toHaveTextContent('Unknown vendor');
        expect(gaps).not.toHaveTextContent('{{unknown_vendor}}');
    });
});
