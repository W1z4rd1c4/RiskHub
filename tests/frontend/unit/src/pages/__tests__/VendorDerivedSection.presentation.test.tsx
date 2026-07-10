import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { VendorDerivedSection } from '@/pages/vendors/VendorDerivedSection';
import type { VendorDerived } from '@/types/vendor';

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

function sampleDerived(overrides: Partial<VendorDerived> = {}): VendorDerived {
    return {
        country_category: 'ČR',
        cif: 'Ano',
        linked_asset_count: 2,
        linked_process_count: 3,
        cif_process_count: 2,
        h_rank: 4,
        max_criticality: 'Kritická',
        tier: 'Kritický dodavatel',
        cif_chain: 'Ano',
        chain_level: 'A',
        direct_sub_provider_names: ['CLOUD OPS s.r.o.'],
        direct_sub_provider_count: 1,
        significance_outcome: 'Ne',
        main_contract_reference: 'SML-2020-001',
        main_contract_arrangement_type: 'Rámcové (master)',
        main_contract_start_date: '2020-01-01',
        main_contract_end_date: '9999-12-31',
        contract_count: 1,
        main_contract_count: 1,
        is_complete: false,
        inputs: {
            country: 'CZ',
            substitutability: 'Nenahraditelný',
            exit_plan_state: 'K revizi',
            ex_ante_assessment_date: null,
            cif_asset_link_count: 2,
            cif_process_link_count: 0,
            tier_cif_chain: true,
            tier_max_rank_at_least_high: true,
            tier_substitutability_match: true,
            cloud_service_link_count: 0,
            manual_process_link_count: 1,
            transitive_process_pair_count: 2,
            missing_for_completeness: ['ex_ante_assessment_date'],
        },
        transitive_process_links: [
            {
                process_id: 7,
                process_name: 'Sjednání pojištění – Online',
                process_cif: 'Ano',
                process_criticality: 'Kritická',
                vendor_id: 4,
                vendor_name: 'BIZ DATA',
                via_asset_id: 11,
                via_asset_name: 'Veris',
            },
        ],
        ...overrides,
    };
}

describe('Vendor derived section (engine block, #49)', () => {
    it('renders the tier pill with the verbatim TierDod label', () => {
        render(<VendorDerivedSection derived={sampleDerived()} />);
        expect(screen.getByTestId('vendor-derived-tier')).toHaveTextContent('Kritický dodavatel');
        expect(screen.getByTestId('vendor-derived-cif')).toHaveTextContent('Ano');
        expect(screen.getByTestId('vendor-derived-cif-chain')).toHaveTextContent('Ano');
        // max_krit + the transitive row's process class use the shared TridyKrit pill.
        expect(screen.getAllByText('Kritická')).toHaveLength(2);
    });

    it('renders the completeness state and the missing-field explain list', () => {
        render(<VendorDerivedSection derived={sampleDerived()} />);
        expect(screen.getByTestId('vendor-derived-completeness')).toHaveTextContent(
            'derived.incomplete',
        );
        expect(screen.getByTestId('vendor-derived-missing')).toHaveTextContent(
            'ex_ante_assessment_date',
        );
    });

    it('renders the derived transitive process rows read-only, with the via-asset', () => {
        render(<VendorDerivedSection derived={sampleDerived()} />);
        const row = screen.getByTestId('vendor-derived-transitive-row-0');
        expect(row).toHaveTextContent('Sjednání pojištění – Online');
        expect(row).toHaveTextContent('Veris');
        // Read-only: the section renders no inputs or buttons.
        expect(screen.getByTestId('vendor-derived-section').querySelector('input')).toBeNull();
        expect(screen.getByTestId('vendor-derived-section').querySelector('button')).toBeNull();
    });

    it('shows the empty state when no transitive pairs exist and blanks the rank-0 class', () => {
        render(
            <VendorDerivedSection
                derived={sampleDerived({
                    transitive_process_links: [],
                    max_criticality: null,
                    h_rank: 0,
                    tier: 'Standardní dodavatel',
                })}
            />,
        );
        expect(screen.getByText('derived.transitive.empty')).toBeInTheDocument();
        expect(screen.getByTestId('vendor-derived-tier')).toHaveTextContent('Standardní dodavatel');
        // MAXIFS-empty -> 0 -> the workbook's blank class renders as a dash.
        expect(screen.getAllByText('—').length).toBeGreaterThan(0);
        expect(screen.queryByText('Kritická')).not.toBeInTheDocument();
    });
});
