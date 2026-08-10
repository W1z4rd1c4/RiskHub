import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IctCommitteeSection } from '@/components/dashboard/IctCommitteeSection';
import { ThemeProvider } from '@/contexts/ThemeContext';
import i18n from '@/i18n';
import type { IctCommittee } from '@/types/ictRegisterCommittee';
import { AuthProviderWithReady } from '@test/authBootstrap';

const getCommittee = vi.fn();

vi.mock('@/services/ictRegisterCommitteeApi', () => ({
    ictRegisterCommitteeApi: {
        getCommittee: (...args: unknown[]) => getCommittee(...args),
    },
}));

// A minimal-but-complete read model: the two CRO matrices only need their rows, but the
// section renders the whole sheet, so every required field is present (empty lists are fine).
function makeCommittee(): IctCommittee {
    return {
        dashboard: {
            register_state: {
                process_count: 1,
                asset_count: 1,
                process_asset_link_count: 1,
                vendor_count: 1,
                assets_pending_review_count: 1,
                direct_process_vendor_link_count: 1,
                contracts_in_roi_scope_count: 1,
                sub_outsourcing_link_count: 0,
                assets_without_data_classification_count: 1,
                top_tier_vendors_without_orderly_exit_count: 1,
            },
            key_metrics: {
                cif_process_count: 1,
                processes_without_impact_assessment_count: 1,
                critical_asset_count: 1,
                critical_vendor_count: 1,
                risks_above_tolerance_count: 1,
                open_dq_finding_count: 1,
            },
        },
        cro: {
            kpi: {
                risk_count: 1,
                material_risk_count: 0,
                risks_above_tolerance_count: 1,
                accepted_above_tolerance_count: 0,
                cif_without_bcm_count: 0,
                open_dq_finding_count: 1,
                material_risk_count_production_inert: false,
            },
            heatmap: {
                rows: [5, 4, 3, 2, 1].map((probability) => ({
                    probability,
                    cells: [0, 0, 0, 0, 0],
                })),
            },
            migration_matrix: {
                rows: [
                    { gross_band: 'Nízké', cells: [0, 0, 0, 0] },
                    { gross_band: 'Střední', cells: [0, 0, 0, 0] },
                    { gross_band: 'Vysoké', cells: [0, 0, 0, 0] },
                    { gross_band: 'Kritické', cells: [0, 0, 0, 0] },
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
            assets_by_criticality: [],
            risks_by_band: [],
        },
        roi_readiness: {
            templates: [],
            overall_readiness_pct: null,
            total_gap_row_count: 0,
        },
    };
}

afterEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
});

describe('IctCommitteeSection — matrix scroll containers (FR-P5-3)', () => {
    it('gives the CRO heatmap and migration matrix overflow-x-auto containers so dense grids scroll, not clip', async () => {
        getCommittee.mockResolvedValue(makeCommittee());

        render(
            <MemoryRouter>
                <AuthProviderWithReady>
                    <ThemeProvider>
                        <IctCommitteeSection />
                    </ThemeProvider>
                </AuthProviderWithReady>
            </MemoryRouter>,
        );

        const heatmap = await screen.findByTestId('committee-heatmap');
        expect(heatmap.querySelector('.overflow-x-auto')).not.toBeNull();

        const migration = screen.getByTestId('committee-migration');
        expect(migration.querySelector('.overflow-x-auto')).not.toBeNull();
    });
});
