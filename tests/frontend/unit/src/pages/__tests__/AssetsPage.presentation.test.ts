import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildAssetColumns } from '@/pages/assets/assetColumns';
import {
    assetCompletenessFieldLabel,
    assetDerivedArticle8Label,
    assetDerivedBooleanLabel,
    assetDerivedCriticalityLabel,
    assetsEmptyStateKey,
    buildAssetWritePayload,
    getAssetDisplayStatus,
} from '@/pages/assets/assetsPagePresentation';
import type { Asset, AssetDerived } from '@/types/asset';

function sampleAssetDerived(overrides: Partial<AssetDerived> = {}): AssetDerived {
    return {
        ciaa_value: 5,
        primary_process_name: 'Sjednání pojištění – Online',
        primary_process_criticality: 'critical',
        inherited_impact_operations: 4,
        inherited_impact_financial: 4,
        inherited_rto_hours: 6,
        business_criticality: 'critical',
        weighted_score: 4.95,
        score_criticality: 'critical',
        h_rank: 4,
        resulting_criticality: 'critical',
        article8_classification: 'critical',
        cif: 'yes',
        cif_process_count: 1,
        cif_process_names: ['Sjednání pojištění – Online'],
        spof: 'yes',
        external_dependency: 'no',
        legacy: 'no',
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
            preliminary_criticality: 'critical',
            lifecycle_state: 'operational',
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
            missing_for_completeness: [],
        },
        ...overrides,
    };
}

function sampleAsset(overrides: Partial<Asset> = {}): Asset {
    return {
        id: 7,
        name: 'Veris',
        asset_type: 'application',
        asset_level: 'primary',
        description: null,
        physical_location: null,
        deployment_model: 'on_premise',
        alternative_names: null,
        business_owner_user_id: 11,
        ict_owner_user_id: 12,
        owning_department_id: 4,
        business_owner: { name: 'Alex Owner', role_name: 'business_owner', department_name: 'Operations' },
        ict_owner: { name: 'Ivy ICT', role_name: 'ict_owner', department_name: 'Technology' },
        owning_department: { name: 'Operations', code: 'OPS' },
        business_owner_orphaned: false,
        ict_owner_orphaned: false,
        ownership_status: 'assigned',
        gdpr_relevance: 'yes',
        ai_relevance: 'no',
        data_classification: null,
        confidentiality_rating: 5,
        integrity_rating: 5,
        availability_rating: 5,
        authenticity_rating: 5,
        impact_client: 5,
        impact_regulatory: 5,
        substitutability_rating: 5,
        vendor_dependency_rating: 4,
        internet_exposed: 'no',
        preliminary_criticality: 'critical',
        lifecycle_state: 'operational',
        standard_support_end_date: null,
        extended_support_end_date: null,
        custom_support_end_date: null,
        last_legacy_risk_assessment_date: null,
        review_state: 'review_required',
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
    it('derives the display status from the archive flag', () => {
        expect(getAssetDisplayStatus(sampleAsset())).toBe('active');
        expect(getAssetDisplayStatus(sampleAsset({ is_archived: true }))).toBe('archived');
    });

    it('distinguishes an empty register from an unmatched search (FR-P5-5)', () => {
        expect(assetsEmptyStateKey(false)).toBe('empty.no_assets');
        expect(assetsEmptyStateKey(true)).toBe('empty.no_results');
    });

    it('maps canonical derived API codes and completeness keys to translations only', () => {
        const t = (key: string) => key;
        expect(assetDerivedCriticalityLabel(t, 'critical')).toBe(
            'assets:values.preliminary_criticality.critical',
        );
        expect(assetDerivedBooleanLabel(t, 'yes')).toBe(
            'assets:derived.values.boolean.yes',
        );
        expect(assetDerivedArticle8Label(t, 'non_critical')).toBe(
            'assets:derived.values.article8.non_critical',
        );
        expect(assetCompletenessFieldLabel(t, 'business_owner')).toBe(
            'assets:form.business_owner',
        );
        expect(assetCompletenessFieldLabel(t, 'primary_process')).toBe(
            'assets:derived.primary_process_name',
        );
        expect(assetDerivedBooleanLabel(t, 'Ano')).toBe('assets:values.unknown');
        expect(assetDerivedCriticalityLabel(t, 'Kritická')).toBe('assets:values.unknown');
    });

    it('strips empty strings to nulls and drops untouched fields in write payloads', () => {
        expect(
            buildAssetWritePayload({
                name: 'Veris',
                asset_type: '',
                business_owner_user_id: 11,
                confidentiality_rating: 5,
                integrity_rating: null,
                lifecycle_state: 'V provozu',
                notes: '',
            })
        ).toEqual({
            name: 'Veris',
            asset_type: null,
            business_owner_user_id: 11,
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
                sampleAsset({ derived: sampleAssetDerived({ resulting_criticality: 'high' }) }),
                0
            ) as ReactElement
        );
        expect(screen.getByText('assets:values.preliminary_criticality.high')).toBeInTheDocument();

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
        expect(screen.getByText('assets:derived.values.boolean.yes')).toBeInTheDocument();

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
        expect(screen.getByText('assets:values.lifecycle_state.operational')).toBeInTheDocument();
    });
});
