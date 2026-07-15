import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IctCommitteeSection } from '@/components/dashboard/IctCommitteeSection';
import { ThemeProvider } from '@/contexts/ThemeContext';
import i18n from '@/i18n';
import type { IctCommittee, IctRoiTemplateReadiness } from '@/types/ictRegisterCommittee';
import { AuthProviderWithReady } from '@test/authBootstrap';

const getCommittee = vi.fn();

vi.mock('@/services/ictRegisterCommitteeApi', () => ({
    ictRegisterCommitteeApi: {
        getCommittee: (...args: unknown[]) => getCommittee(...args),
    },
}));

function roiTemplate(overrides: Partial<IctRoiTemplateReadiness> = {}): IctRoiTemplateReadiness {
    return {
        code: 'RT01',
        name_en: 'Template',
        name_cs: 'Šablona',
        feed: 'derived',
        gate: 'complete',
        coverage: 'full',
        row_count: 10,
        required_field_count: 4,
        populated_field_count: 4,
        readiness_pct: 95,
        gap_row_count: 0,
        gap_rows: [],
        ...overrides,
    };
}

// Distinct, non-colliding counts so a tile's number can be located by value
// inside its own testid container.
function makeCommittee(): IctCommittee {
    return {
        dashboard: {
            register_state: {
                process_count: 148,
                asset_count: 183,
                process_asset_link_count: 1000,
                vendor_count: 30,
                assets_pending_review_count: 7, // blocking > 0 → amber
                direct_process_vendor_link_count: 358,
                contracts_in_roi_scope_count: 1,
                sub_outsourcing_link_count: 5,
                assets_without_data_classification_count: 0, // blocking = 0 → emerald
                top_tier_vendors_without_orderly_exit_count: 25, // blocking > 0 → amber
            },
            key_metrics: {
                cif_process_count: 79, // inventory → white
                processes_without_impact_assessment_count: 148,
                critical_asset_count: 12,
                critical_vendor_count: 26,
                risks_above_tolerance_count: 4, // blocking > 0 → amber
                open_dq_finding_count: 23,
            },
        },
        cro: {
            kpi: {
                risk_count: 8, // inventory → white
                material_risk_count: 0,
                risks_above_tolerance_count: 4,
                accepted_above_tolerance_count: 0, // blocking = 0 → emerald
                cif_without_bcm_count: 3,
                open_dq_finding_count: 23, // blocking > 0 → amber
                material_risk_count_production_inert: false,
            },
            heatmap: {
                rows: [5, 4, 3, 2, 1].map((probability) => ({
                    probability,
                    cells: [0, 1, 2, 3, 4],
                })),
            },
            migration_matrix: {
                rows: [
                    { gross_band: 'Nízké', cells: [1, 0, 0, 0] },
                    { gross_band: 'Střední', cells: [0, 2, 0, 0] },
                    { gross_band: 'Vysoké', cells: [0, 0, 3, 0] },
                    { gross_band: 'Kritické', cells: [0, 0, 0, 5] },
                ],
            },
            top_risks: [],
            top_vendors: [],
            narratives: {
                cif_process_count: 1,
                process_count: 1,
                cif_with_bcm_count: 1,
                critical_vendor_count: 1,
                critical_vendors_with_functional_exit_count: 0,
                critical_vendors_with_identifier_count: 1,
                tolerance: 1,
                risks_above_tolerance_count: 1,
                accepted_above_tolerance_count: 0,
                sub_outsourcing_link_count: 0,
                vendors_in_sub_role_count: 0,
            },
            assets_by_criticality: [{ band: 'Kritická', count: 2 }],
            risks_by_band: [{ band: 'Vysoké', gross_count: 3, net_count: 1 }],
        },
        roi_readiness: {
            templates: [
                roiTemplate({ code: 'RT01', readiness_pct: 95 }), // ≥ 80 → emerald
                roiTemplate({ code: 'RT02', coverage: 'partial', readiness_pct: 60 }), // ≥ 50 → amber
                roiTemplate({ code: 'RT03', coverage: 'partial', readiness_pct: 20 }), // < 50 → rose
            ],
            overall_readiness_pct: 58,
            total_gap_row_count: 0,
        },
    };
}

function renderSection() {
    return render(
        <MemoryRouter>
            <AuthProviderWithReady>
                <ThemeProvider>
                    <IctCommitteeSection />
                </ThemeProvider>
            </AuthProviderWithReady>
        </MemoryRouter>,
    );
}

afterEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
});

describe('IctCommitteeSection — blocking-count priority (FR-P5-6 / S1)', () => {
    it('prioritizes blocking counts (amber when > 0, emerald when cleared) apart from neutral inventory', async () => {
        getCommittee.mockResolvedValue(makeCommittee());
        renderSection();

        // A non-zero blocking register-state tile reads amber, not neutral white.
        const pending = await screen.findByTestId('committee-state-assets_pending_review_count');
        expect(within(pending).getByText('7').className).toContain('text-amber-300');

        // A cleared blocking tile reads emerald (all good), still not inventory-white.
        const noGap = screen.getByTestId('committee-state-assets_without_data_classification_count');
        expect(within(noGap).getByText('0').className).toContain('text-emerald-400');

        // A pure inventory count keeps the neutral white treatment.
        const processes = screen.getByTestId('committee-state-process_count');
        expect(within(processes).getByText('148').className).toContain('text-white');

        // Key-metrics table: blocking metric amber, inventory metric white.
        const toleranceMetric = screen.getByTestId('committee-metric-risks_above_tolerance_count');
        expect(within(toleranceMetric).getByText('4').className).toContain('text-amber-300');
        const cifMetric = screen.getByTestId('committee-metric-cif_process_count');
        expect(within(cifMetric).getByText('79').className).toContain('text-white');

        // CRO KPI strip: blocking KPI amber (> 0) / emerald (= 0), inventory white.
        const openDq = screen.getByTestId('committee-kpi-open_dq_finding_count');
        expect(within(openDq).getByText('23').className).toContain('text-amber-300');
        const accepted = screen.getByTestId('committee-kpi-accepted_above_tolerance_count');
        expect(within(accepted).getByText('0').className).toContain('text-emerald-400');
        const riskCount = screen.getByTestId('committee-kpi-risk_count');
        expect(within(riskCount).getByText('8').className).toContain('text-white');
    });
});

describe('IctCommitteeSection — heatmap legend + RoI threshold (FR-P5-7 / P10)', () => {
    it('renders a legend for both magnitude heatmaps', async () => {
        getCommittee.mockResolvedValue(makeCommittee());
        renderSection();

        const heatmapLegend = await screen.findByTestId('committee-heatmap-legend');
        expect(heatmapLegend).toHaveTextContent('Risks per cell');
        // Swatch labels sample the count scale (0 … max+).
        expect(within(heatmapLegend).getByText('4+')).toBeInTheDocument();

        const migrationLegend = screen.getByTestId('committee-migration-legend');
        expect(migrationLegend).toHaveTextContent('Risks per cell');
        expect(within(migrationLegend).getByText('5+')).toBeInTheDocument();
    });

    it('colours the RoI readiness bar by threshold (ready / partial / at-risk)', async () => {
        getCommittee.mockResolvedValue(makeCommittee());
        renderSection();

        expect((await screen.findByTestId('committee-roi-bar-RT01')).className).toContain('bg-emerald-500');
        expect(screen.getByTestId('committee-roi-bar-RT02').className).toContain('bg-amber-500');
        expect(screen.getByTestId('committee-roi-bar-RT03').className).toContain('bg-rose-500');
    });
});

describe('IctCommitteeSection — semantic drill-downs', () => {
    it('links matrix coordinates and keyboard-accessible chart bars to exact filters', async () => {
        getCommittee.mockResolvedValue(makeCommittee());
        renderSection();

        expect(await screen.findByTestId('committee-heatmap-link-5-3')).toHaveAttribute(
            'href',
            '/risks?gross_probability=5&gross_impact=3',
        );
        expect(screen.getByTestId('committee-migration-link-Vysoké-Střední')).toHaveAttribute(
            'href',
            '/risks?gross_band=Vysok%C3%A9&net_band=St%C5%99edn%C3%AD',
        );
    });

    it('renders a production-inert material-risk KPI without an interactive link', async () => {
        const committee = makeCommittee();
        committee.cro.kpi.material_risk_count_production_inert = true;
        getCommittee.mockResolvedValue(committee);
        renderSection();

        const tile = await screen.findByTestId('committee-kpi-material_risk_count');
        expect(tile.closest('a')).toBeNull();
        expect(tile).toHaveTextContent('Not yet measurable');
    });
});
