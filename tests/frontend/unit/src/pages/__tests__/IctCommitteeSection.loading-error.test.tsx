import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProviderWithReady } from '@test/authBootstrap';
import { IctCommitteeSection } from '@/components/dashboard/IctCommitteeSection';
import i18n from '@/i18n';
import type { IctCommittee } from '@/types/ictRegisterCommittee';

// FR-P3-4 (#62, N17 / C3 / C4): the Committee screen does not consume
// SortableTable, so it drives the shared table-error contract (#70) directly.
// These tests pin the explicit aria-busy loading branch and the localized error +
// retry branch so a failed fetch is never rendered as an empty / zero screen.

const getCommittee = vi.fn();

vi.mock('@/services/ictRegisterCommitteeApi', () => ({
    ictRegisterCommitteeApi: {
        getCommittee: (...args: unknown[]) => getCommittee(...args),
    },
}));

const EN_TABLE_ERROR = "We couldn't load this table. Please try again.";
const CS_TABLE_ERROR = 'Tuto tabulku se nepodařilo načíst. Zkuste to prosím znovu.';

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
            heatmap: { rows: [] },
            migration_matrix: { rows: [] },
            top_risks: [],
            top_vendors: [],
            narratives: {
                cif_process_count: 79,
                process_count: 148,
                cif_with_bcm_count: 76,
                critical_vendor_count: 26,
                critical_vendors_with_functional_exit_count: 1,
                critical_vendors_with_identifier_count: 26,
                tolerance: 39,
                risks_above_tolerance_count: 4,
                accepted_above_tolerance_count: 0,
                sub_outsourcing_link_count: 5,
                vendors_in_sub_role_count: 1,
            },
            assets_by_criticality: [],
            risks_by_band: [],
        },
        roi_readiness: {
            templates: [],
            overall_readiness_pct: 90,
            total_gap_row_count: 0,
        },
    };
}

function renderSection() {
    render(
        <MemoryRouter>
            <AuthProviderWithReady>
                <ThemeProvider>
                    <IctCommitteeSection />
                </ThemeProvider>
            </AuthProviderWithReady>
        </MemoryRouter>
    );
}

afterEach(async () => {
    getCommittee.mockReset();
    await i18n.changeLanguage('en');
});

describe('IctCommitteeSection loading + error branches (FR-P3-4)', () => {
    it('renders an aria-busy loading branch and no dashboard tiles while the first fetch is in flight', async () => {
        getCommittee.mockReturnValue(new Promise<IctCommittee>(() => {}));
        renderSection();

        const loading = await screen.findByTestId('committee-loading');
        expect(loading).toHaveAttribute('aria-busy', 'true');
        // C3/C4: no tiles (and therefore no false zero counts) render during load.
        expect(screen.queryByTestId('committee-state-process_count')).not.toBeInTheDocument();
    });

    it('replaces the screen with the shared localized error + retry when the first fetch fails', async () => {
        getCommittee.mockRejectedValue(new Error('boom'));
        renderSection();

        const errorBlock = await screen.findByTestId('committee-error');
        expect(errorBlock).toHaveTextContent(EN_TABLE_ERROR);
        // C4: a failed fetch is never an empty / zero state.
        expect(screen.queryByTestId('committee-state-process_count')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('re-invokes the fetch when Retry is clicked', async () => {
        getCommittee.mockRejectedValue(new Error('boom'));
        const user = userEvent.setup();
        renderSection();

        await user.click(await screen.findByRole('button', { name: 'Retry' }));

        await waitFor(() => expect(getCommittee).toHaveBeenCalledTimes(2));
    });

    it('keeps last-good content under a stale-data banner and retries the failed refresh', async () => {
        const committee = makeCommittee();
        getCommittee
            .mockResolvedValueOnce(committee)
            .mockRejectedValueOnce(new Error('stale refresh failed'))
            .mockResolvedValueOnce(committee);
        const user = userEvent.setup();
        renderSection();

        const processTile = await screen.findByTestId('committee-state-process_count');
        expect(processTile).toHaveTextContent('148');

        await user.click(screen.getByTestId('committee-refresh-button'));

        const banner = await screen.findByTestId('committee-error-banner');
        expect(banner).toHaveTextContent(EN_TABLE_ERROR);
        expect(screen.getByTestId('committee-state-process_count')).toHaveTextContent('148');

        await user.click(within(banner).getByRole('button', { name: 'Retry' }));

        await waitFor(() => expect(getCommittee).toHaveBeenCalledTimes(3));
        await waitFor(() => expect(screen.queryByTestId('committee-error-banner')).not.toBeInTheDocument());
        expect(screen.getByTestId('committee-state-process_count')).toHaveTextContent('148');
    });

    it('localizes the error message in Czech', async () => {
        await i18n.changeLanguage('cs');
        getCommittee.mockRejectedValue(new Error('boom'));
        renderSection();

        expect(await screen.findByTestId('committee-error')).toHaveTextContent(CS_TABLE_ERROR);
    });
});
