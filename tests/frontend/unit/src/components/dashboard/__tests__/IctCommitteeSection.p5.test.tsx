import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DrilldownBarShape, IctCommitteeSection } from '@/components/dashboard/IctCommitteeSection';
import {
    assetCriticalityDrilldownPath,
    riskBandDrilldownPath,
} from '@/pages/ictRegisterCommittee/committeePresentation';
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

// Router mock for the chart-bar drilldowns (#102): the SVG bar anchors must
// navigate in-app via useNavigate instead of a full page reload.
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

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
                assets_pending_review_count: 7, // blocking > 0 → warning
                direct_process_vendor_link_count: 358,
                contracts_in_roi_scope_count: 1,
                sub_outsourcing_link_count: 5,
                assets_without_data_classification_count: 0, // blocking = 0 → success-derived
                top_tier_vendors_without_orderly_exit_count: 25, // blocking > 0 → warning
            },
            key_metrics: {
                cif_process_count: 79, // inventory → white
                processes_without_impact_assessment_count: 148,
                critical_asset_count: 12,
                critical_vendor_count: 26,
                risks_above_tolerance_count: 4, // blocking > 0 → warning
                open_dq_finding_count: 23,
            },
        },
        cro: {
            kpi: {
                risk_count: 8, // inventory → white
                material_risk_count: 0,
                risks_above_tolerance_count: 4,
                accepted_above_tolerance_count: 0, // blocking = 0 → success-derived
                cif_without_bcm_count: 3,
                open_dq_finding_count: 23, // blocking > 0 → warning
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
                roiTemplate({ code: 'RT01', readiness_pct: 95 }), // ≥ 80 → success
                roiTemplate({ code: 'RT02', coverage: 'partial', readiness_pct: 60 }), // ≥ 50 → warning
                roiTemplate({ code: 'RT03', coverage: 'partial', readiness_pct: 20 }), // < 50 → destructive
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
    it('prioritizes blocking counts (warning when > 0, success-derived when cleared) apart from neutral inventory', async () => {
        getCommittee.mockResolvedValue(makeCommittee());
        renderSection();

        // A non-zero blocking register-state tile reads amber via the semantic
        // warning token, not neutral white (#102 / ADR-015).
        const pending = await screen.findByTestId('committee-state-assets_pending_review_count');
        expect(within(pending).getByText('7').className).toContain('text-warning');

        // A cleared blocking tile reads green via the standalone-text success
        // token (contrast-contract-tested in statusTokenContrast.test.ts).
        const noGap = screen.getByTestId('committee-state-assets_without_data_classification_count');
        expect(within(noGap).getByText('0').className).toContain('text-success-text');

        // A pure inventory count keeps the neutral white treatment.
        const processes = screen.getByTestId('committee-state-process_count');
        expect(within(processes).getByText('148').className).toContain('text-white');

        // Key-metrics table: blocking metric warning-token amber, inventory metric white.
        const toleranceMetric = screen.getByTestId('committee-metric-risks_above_tolerance_count');
        expect(within(toleranceMetric).getByText('4').className).toContain('text-warning');
        const cifMetric = screen.getByTestId('committee-metric-cif_process_count');
        expect(within(cifMetric).getByText('79').className).toContain('text-white');

        // CRO KPI strip: blocking KPI warning (> 0) / success-text (= 0), inventory white.
        const openDq = screen.getByTestId('committee-kpi-open_dq_finding_count');
        expect(within(openDq).getByText('23').className).toContain('text-warning');
        const accepted = screen.getByTestId('committee-kpi-accepted_above_tolerance_count');
        expect(within(accepted).getByText('0').className).toContain('text-success-text');
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

    it('colours the RoI readiness bar by threshold (ready / partial / at-risk) from the status tokens', async () => {
        getCommittee.mockResolvedValue(makeCommittee());
        renderSection();

        expect((await screen.findByTestId('committee-roi-bar-RT01')).className).toContain('bg-success');
        expect(screen.getByTestId('committee-roi-bar-RT02').className).toContain('bg-warning');
        expect(screen.getByTestId('committee-roi-bar-RT03').className).toContain('bg-destructive');
    });
});

describe('IctCommitteeSection — semantic drill-downs', () => {
    it('links matrix coordinates and keyboard-accessible chart bars to exact filters', async () => {
        getCommittee.mockResolvedValue(makeCommittee());
        renderSection();

        const expectRiskHref = (link: HTMLElement, expectedParams: Record<string, string>) => {
            const url = new URL(link.getAttribute('href') ?? '', 'http://localhost');
            expect(url.pathname).toBe('/risks');
            expect(Object.fromEntries(url.searchParams)).toEqual(expectedParams);
        };
        expectRiskHref(await screen.findByTestId('committee-heatmap-link-5-3'), {
            committee_scope: 'true',
            ict_linked: 'true',
            gross_probability: '5',
            gross_impact: '3',
        });
        expectRiskHref(screen.getByTestId('committee-migration-link-Vysoké-Střední'), {
            committee_scope: 'true',
            ict_linked: 'true',
            gross_band: 'Vysoké',
            net_band: 'Střední',
        });
    });

    // jsdom cannot lay out the recharts bars (zero-size container), so the
    // drilldown shape is exercised directly with the same hrefForBand builders
    // the charts pass in.
    function renderAssetBarShape() {
        return render(
            <MemoryRouter>
                <svg>
                    <DrilldownBarShape
                        payload={{ band: 'Kritická' }}
                        x={0}
                        y={0}
                        width={40}
                        height={100}
                        hrefForBand={assetCriticalityDrilldownPath}
                        testIdPrefix="committee-asset-bar-shape"
                    />
                </svg>
            </MemoryRouter>,
        );
    }

    it('navigates chart-bar drilldowns in-app on click instead of a full page reload (#102)', () => {
        renderAssetBarShape();

        const bar = screen.getByTestId('committee-asset-bar-shape-Kritická');
        // The real href is kept for open-in-new-tab semantics…
        expect(bar.getAttribute('href')).toBe('/assets?committee_scope=true&criticality=critical');

        // …while a plain left click routes through the SPA router.
        fireEvent.click(bar);
        expect(mockNavigate).toHaveBeenCalledWith('/assets?committee_scope=true&criticality=critical');

        // A modified click keeps the native new-tab behaviour.
        mockNavigate.mockClear();
        fireEvent.click(bar, { ctrlKey: true });
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('activates chart-bar drilldowns from the keyboard (Enter and Space) (#102)', () => {
        render(
            <MemoryRouter>
                <svg>
                    <DrilldownBarShape
                        payload={{ band: 'Vysoké' }}
                        x={0}
                        y={0}
                        width={40}
                        height={100}
                        hrefForBand={(band) => riskBandDrilldownPath(band, 'net')}
                        testIdPrefix="committee-risk-bar-shape-net"
                    />
                </svg>
            </MemoryRouter>,
        );

        const expectedPath = `/risks?${new URLSearchParams({
            committee_scope: 'true',
            ict_linked: 'true',
            net_band: 'Vysoké',
        }).toString()}`;
        const bar = screen.getByTestId('committee-risk-bar-shape-net-Vysoké');
        expect(bar.getAttribute('tabindex')).toBe('0');

        fireEvent.keyDown(bar, { key: 'Enter' });
        expect(mockNavigate).toHaveBeenCalledWith(expectedPath);

        mockNavigate.mockClear();
        fireEvent.keyDown(bar, { key: ' ' });
        expect(mockNavigate).toHaveBeenCalledWith(expectedPath);
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
