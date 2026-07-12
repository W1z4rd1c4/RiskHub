import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildAssetColumns } from '@/pages/assets/assetColumns';
import {
    assetsEmptyStateKey,
    buildAssetListParams,
    buildAssetWritePayload,
    getAssetDisplayStatus,
} from '@/pages/assets/assetsPagePresentation';
import type { Asset, AssetDerived } from '@/types/asset';

function sampleAssetDerived(overrides: Partial<AssetDerived> = {}): AssetDerived {
    return {
        ciaa_value: 5,
        primary_process_name: 'Sjednání pojištění – Online',
        primary_process_criticality: 'Kritická',
        inherited_impact_operations: 4,
        inherited_impact_financial: 4,
        inherited_rto_hours: 6,
        business_criticality: 'Kritická',
        weighted_score: 4.95,
        score_criticality: 'Kritická',
        h_rank: 4,
        resulting_criticality: 'Kritická',
        article8_classification: 'Kritické',
        cif: 'Ano',
        cif_process_count: 1,
        cif_process_names: ['Sjednání pojištění – Online'],
        spof: 'Ano',
        external_dependency: 'Ne',
        legacy: 'Ne',
        linked_process_count: 2,
        linked_vendor_count: 0,
        linked_asset_names: [],
        vendor_names: [],
        ict_service_codes: [],
        contract_references: [],
        inputs: {
            confidentiality_rating: 5,
            integrity_rating: 5,
            availability_rating: 5,
            authenticity_rating: 5,
            impact_client: 5,
            impact_regulatory: 5,
            substitutability_rating: 5,
            vendor_dependency_rating: 4,
            preliminary_criticality: 'Kritická',
            lifecycle_state: 'V provozu',
            standard_support_end_date: null,
            reference_date: '2026-07-03',
            threshold_low_score: 2,
            threshold_medium_score: 3,
            threshold_high_score: 4,
            primary_process_id: 1,
            rank_primary_process_criticality: 4,
            rank_score_criticality: 4,
            rank_preliminary_criticality: 4,
            rank_business_criticality: 4,
            rank_cif_floor: 2,
        },
        ...overrides,
    };
}

function sampleAsset(overrides: Partial<Asset> = {}): Asset {
    return {
        id: 7,
        name: 'Veris',
        asset_type: 'Aplikace',
        asset_level: 'A – primární',
        description: null,
        physical_location: null,
        deployment_model: 'On-premise',
        alternative_names: null,
        business_owner: 'Provozní úsek',
        owner_department: 'IT',
        ict_owner: null,
        gdpr_relevance: 'Ano',
        ai_relevance: 'Ne',
        data_classification: null,
        confidentiality_rating: 5,
        integrity_rating: 5,
        availability_rating: 5,
        authenticity_rating: 5,
        impact_client: 5,
        impact_regulatory: 5,
        substitutability_rating: 5,
        vendor_dependency_rating: 4,
        internet_exposed: 'Ne',
        preliminary_criticality: 'Kritická',
        lifecycle_state: 'V provozu',
        standard_support_end_date: null,
        extended_support_end_date: null,
        custom_support_end_date: null,
        last_legacy_risk_assessment_date: null,
        review_state: 'K revizi',
        notes: null,
        primary_process_id: null,
        derived: sampleAssetDerived(),
        is_archived: false,
        archived_at: null,
        archived_by_id: null,
        capabilities: null,
        created_at: '2026-07-10T10:00:00Z',
        updated_at: '2026-07-10T10:00:00Z',
        ...overrides,
    };
}

describe('Assets page presentation helpers', () => {
    it('builds register list params with search, archive filter, sort, and paging', () => {
        expect(
            buildAssetListParams({
                currentPage: 3,
                debouncedSearch: '  veris  ',
                includeArchived: true,
                limit: 20,
                sortDirection: 'desc',
                sortField: 'name',
            })
        ).toEqual({
            offset: 40,
            limit: 20,
            include_archived: true,
            search: 'veris',
            sort_by: 'name',
            sort_order: 'desc',
        });

        expect(
            buildAssetListParams({
                currentPage: 1,
                debouncedSearch: '',
                includeArchived: false,
                limit: 20,
                sortDirection: null,
                sortField: null,
            })
        ).toEqual({ offset: 0, limit: 20, include_archived: false });
    });

    it('derives the display status from the archive flag', () => {
        expect(getAssetDisplayStatus(sampleAsset())).toBe('active');
        expect(getAssetDisplayStatus(sampleAsset({ is_archived: true }))).toBe('archived');
    });

    it('distinguishes an empty register from an unmatched search (FR-P5-5)', () => {
        expect(assetsEmptyStateKey(false)).toBe('empty.no_assets');
        expect(assetsEmptyStateKey(true)).toBe('empty.no_results');
    });

    it('strips empty strings to nulls and drops untouched fields in write payloads', () => {
        expect(
            buildAssetWritePayload({
                name: 'Veris',
                asset_type: '',
                business_owner: '  Provozní úsek ',
                confidentiality_rating: 5,
                integrity_rating: null,
                lifecycle_state: 'V provozu',
                notes: '',
            })
        ).toEqual({
            name: 'Veris',
            asset_type: null,
            business_owner: 'Provozní úsek',
            confidentiality_rating: 5,
            integrity_rating: null,
            lifecycle_state: 'V provozu',
            notes: null,
        });
    });

    it('renders the name, derived criticality pill, and archived status in the table columns', () => {
        const columns = buildAssetColumns({
            t: (key: string) => key,
            onRestore: () => undefined,
            canRestoreAsset: () => false,
        });

        const nameColumn = columns.find((column) => column.key === 'name');
        render(nameColumn?.render?.(sampleAsset(), 0) as ReactElement);
        expect(screen.getByText('Veris')).toBeInTheDocument();

        // Ticket #48: the register shows the ENGINE-derived resulting class
        // (vysledna), not the entered preliminary input.
        const criticalityColumn = columns.find((column) => column.key === 'derived_resulting_criticality');
        render(
            criticalityColumn?.render?.(
                sampleAsset({ derived: sampleAssetDerived({ resulting_criticality: 'Vysoká' }) }),
                0
            ) as ReactElement
        );
        expect(screen.getByText('Vysoká')).toBeInTheDocument();

        const statusColumn = columns.find((column) => column.key === 'status');
        render(statusColumn?.render?.(sampleAsset({ is_archived: true }), 0) as ReactElement);
        expect(screen.getByText('assets:status.archived')).toBeInTheDocument();
    });

    it('renders the derived CIF read-only with a placeholder when absent', () => {
        const columns = buildAssetColumns({
            t: (key: string) => key,
            onRestore: () => undefined,
            canRestoreAsset: () => false,
        });

        const cifColumn = columns.find((column) => column.key === 'derived_cif');
        render(cifColumn?.render?.(sampleAsset(), 0) as ReactElement);
        expect(screen.getByText('Ano')).toBeInTheDocument();

        render(cifColumn?.render?.(sampleAsset({ derived: null }), 0) as ReactElement);
        expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('exposes the type, lifecycle state, and owner in the register column set', () => {
        const columns = buildAssetColumns({
            t: (key: string) => key,
            onRestore: () => undefined,
            canRestoreAsset: () => false,
        });
        const keys = columns.map((column) => column.key);

        expect(keys).toContain('asset_type');
        expect(keys).toContain('lifecycle_state');
        expect(keys).toContain('business_owner');
        expect(keys).not.toContain('preliminary_criticality');

        const lifecycleColumn = columns.find((column) => column.key === 'lifecycle_state');
        render(lifecycleColumn?.render?.(sampleAsset(), 0) as ReactElement);
        expect(screen.getByText('V provozu')).toBeInTheDocument();
    });
});
