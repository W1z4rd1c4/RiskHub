import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IctCommitteeSection } from '@/components/dashboard/IctCommitteeSection';
import { ThemeProvider } from '@/contexts/ThemeContext';
import i18n from '@/i18n';
import type { IctCommittee, IctRoiTemplateReadiness } from '@/types/ictRegisterCommittee';
import type { VendorReportCapabilities } from '@/types/vendorReport';
import { AuthProviderWithReady } from '@test/authBootstrap';

const getCommittee = vi.fn();
const getCapabilities = vi.fn();

vi.mock('@/services/ictRegisterCommitteeApi', () => ({
    ictRegisterCommitteeApi: {
        getCommittee: (...args: unknown[]) => getCommittee(...args),
    },
}));

vi.mock('@/services/vendorReportApi', () => ({
    vendorReportApi: {
        getCapabilities: (...args: unknown[]) => getCapabilities(...args),
    },
}));

// N21: gate ONLY on can_download_dora_register (separate vendor_report
// capabilities = reports:read + role), never ict_committee:read / vendors:read.
function reportCapabilities(canDownloadDora: boolean): VendorReportCapabilities {
    return {
        can_read: true,
        can_download_annual_report: false,
        can_download_dora_register: canDownloadDora,
        can_use_department_filter: false,
    };
}

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

function makeCommittee(): IctCommittee {
    return {
        dashboard: {
            register_state: {
                process_count: 148,
                asset_count: 183,
                process_asset_link_count: 1000,
                vendor_count: 30,
                assets_pending_review_count: 7,
                direct_process_vendor_link_count: 358,
                contracts_in_roi_scope_count: 1,
                sub_outsourcing_link_count: 5,
                assets_without_data_classification_count: 0,
                top_tier_vendors_without_orderly_exit_count: 25,
            },
            key_metrics: {
                cif_process_count: 79,
                processes_without_impact_assessment_count: 148,
                critical_asset_count: 12,
                critical_vendor_count: 26,
                risks_above_tolerance_count: 4,
                open_dq_finding_count: 23,
            },
        },
        cro: {
            kpi: {
                risk_count: 8,
                material_risk_count: 0,
                risks_above_tolerance_count: 4,
                accepted_above_tolerance_count: 0,
                cif_without_bcm_count: 3,
                open_dq_finding_count: 23,
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
            assets_by_criticality: [],
            risks_by_band: [],
        },
        roi_readiness: {
            templates: [roiTemplate()],
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

beforeEach(() => {
    getCommittee.mockReset();
    getCapabilities.mockReset();
    getCommittee.mockResolvedValue(makeCommittee());
});

afterEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
});

describe('IctCommitteeSection — capability-gated register export link (FR-P5-8 / N21 / S2)', () => {
    it('links to the register export when can_download_dora_register is granted', async () => {
        getCapabilities.mockResolvedValue(reportCapabilities(true));

        renderSection();

        const link = await screen.findByTestId('register-export-link');
        expect(link).toHaveAttribute('href', '/vendor-reports');
        expect(link).toHaveTextContent('Download DORA register');
    });

    it('hides the export link when can_download_dora_register is denied', async () => {
        getCapabilities.mockResolvedValue(reportCapabilities(false));

        renderSection();

        // The committee header renders (refresh button present) and the probe ran.
        await screen.findByTestId('committee-refresh-button');
        await waitFor(() => expect(getCapabilities).toHaveBeenCalled());
        expect(screen.queryByTestId('register-export-link')).not.toBeInTheDocument();
    });

    it('fails closed (no link) when the capability probe errors', async () => {
        getCapabilities.mockRejectedValue(new Error('network'));

        renderSection();

        await screen.findByTestId('committee-refresh-button');
        await waitFor(() => expect(getCapabilities).toHaveBeenCalled());
        expect(screen.queryByTestId('register-export-link')).not.toBeInTheDocument();
    });
});
