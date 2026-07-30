import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { GovernedMutationDiff } from '@/components/approvals/GovernedMutationDiff';
import i18n from '@/i18n';

describe('GovernedMutationDiff', () => {
    const changeLanguage = async (language: 'cs' | 'en') => {
        await act(async () => {
            await i18n.changeLanguage(language);
        });
    };

    afterEach(async () => {
        await changeLanguage('en');
    });

    it.each([
        ['en', 'L1 process', 'Process owner', 'Owning department', 'Critical', 'Yes'],
        ['cs', 'L1 proces', 'Vlastník procesu', 'Vlastnický útvar', 'Kritická', 'Ano'],
    ] as const)(
        'uses localized governed Process labels and controlled values in %s',
        async (locale, processLabel, ownerLabel, departmentLabel, criticalLabel, yesLabel) => {
            await changeLanguage(locale);

            render(
                <GovernedMutationDiff
                    before={{
                        l1_process: 'Payments',
                        process_owner_user_id: 'Alice Owner',
                        owning_department_id: 'OPS — Operations',
                        preliminary_criticality: 'high',
                        cif_override: 'no',
                    }}
                    after={{
                        l1_process: 'Payments v2',
                        process_owner_user_id: 'Bob Owner',
                        owning_department_id: 'FIN — Finance',
                        preliminary_criticality: 'critical',
                        cif_override: 'yes',
                    }}
                    derivedImpact={{
                        before: { cif: 'no', criticality_class: 'high' },
                        after: { cif: 'yes', criticality_class: 'critical' },
                    }}
                />,
            );

            expect(screen.getByText(processLabel)).toBeInTheDocument();
            expect(screen.getByText(ownerLabel)).toBeInTheDocument();
            expect(screen.getByText(departmentLabel)).toBeInTheDocument();
            expect(screen.getByText('OPS — Operations')).toBeInTheDocument();
            expect(screen.getByText('FIN — Finance')).toBeInTheDocument();
            expect(screen.getAllByText(criticalLabel).length).toBeGreaterThan(0);
            expect(screen.getAllByText(yesLabel).length).toBeGreaterThan(0);
            if (locale === 'cs') {
                expect(screen.queryByText('L1 process')).toBeNull();
                expect(screen.queryByText('Process owner')).toBeNull();
            }
        },
    );

    it('shows changed business values, derived impact, and readable impacted resources', async () => {
        await changeLanguage('en');
        render(
            <GovernedMutationDiff
                before={{ l1_process: 'Payments', l0_area: 'Operations' }}
                after={{ l1_process: 'Payments v2', l0_area: 'Operations' }}
                derivedImpact={{
                    before: { cif: 'no', criticality_class: 'medium' },
                    after: { cif: 'yes', criticality_class: 'critical' },
                }}
                impactedResources={[
                    { resource_type: 'asset', resource_name: 'Claims platform' },
                ]}
                testId="governed-diff"
            />,
        );

        expect(screen.getByText('L1 process')).toBeInTheDocument();
        expect(screen.getByText('Payments')).toBeInTheDocument();
        expect(screen.getByText('Payments v2')).toBeInTheDocument();
        expect(screen.queryByText('Operations')).not.toBeInTheDocument();
        expect(screen.getByText('Derived impact')).toBeInTheDocument();
        expect(screen.getByText('Claims platform')).toBeInTheDocument();
    });

    it('fails closed for raw ownership IDs and unknown snapshot fields', async () => {
        await changeLanguage('en');
        render(
            <GovernedMutationDiff
                before={{
                    process_owner_user_id: 7315,
                    owning_department_id: '42',
                    hidden_relationship_payload: 'Secret linked record',
                }}
                after={{
                    process_owner_user_id: 8124,
                    owning_department_id: '84',
                    hidden_relationship_payload: 'Different secret linked record',
                }}
                derivedImpact={{
                    before: { cif: 'no', criticality_class: 'medium' },
                    after: { cif: 'yes', criticality_class: 'critical' },
                }}
                impactedResources={[{ resource_type: 'process', resource_name: '7315' }]}
            />,
        );

        expect(screen.getAllByText('Hidden by permission scope').length).toBeGreaterThan(0);
        expect(screen.getByText('Restricted change')).toBeInTheDocument();
        for (const leakedValue of ['7315', '8124', '42', '84', 'Secret linked record', 'Different secret linked record']) {
            expect(screen.queryByText(leakedValue)).not.toBeInTheDocument();
        }
        expect(screen.queryByText('hidden relationship payload', { exact: false })).not.toBeInTheDocument();
    });

    it('renders only the safe relationship snapshot for governed Process links', async () => {
        render(
            <GovernedMutationDiff
                mutationKind="process.link.asset.update"
                before={{
                    relationship: { related_resource_id: 7315, significance: 'supporting' },
                }}
                after={{
                    relationship: { related_resource_id: 7315, significance: 'critical' },
                }}
                derivedImpact={{
                    processes: [{
                        resource_name: 'F7 — Payments',
                        before: { cif: 'yes', criticality_class: 'high' },
                        after: { cif: 'yes', criticality_class: 'critical' },
                    }],
                }}
                impactedResources={[{ resource_type: 'process', resource_name: 'F7 — Payments' }]}
                relationshipChange={{
                    target_resource_type: 'asset',
                    target_resource_name: 'Claims platform',
                    action: 'update',
                    before: { significance: 'supporting', is_primary: false },
                    after: { significance: 'critical', is_primary: true },
                }}
            />,
        );
        expect(screen.getByText('Update Process and Asset link')).toBeInTheDocument();
        expect(screen.getByText('Relationship change')).toBeInTheDocument();
        expect(screen.getByText('Asset')).toBeInTheDocument();
        expect(screen.getByText('Update relationship')).toBeInTheDocument();
        expect(screen.getByText('Significance')).toBeInTheDocument();
        expect(screen.getByText('Primary relationship')).toBeInTheDocument();
        expect(screen.getByText('Claims platform')).toBeInTheDocument();
        expect(screen.getAllByText('F7 — Payments')).toHaveLength(2);
        expect(screen.queryByText('7315')).not.toBeInTheDocument();
        expect(screen.queryByText(/resource_id/i)).not.toBeInTheDocument();
    });

    it('renders protected creation derived impact without dereferencing the null before state', () => {
        render(
            <GovernedMutationDiff
                mutationKind="process.create"
                before={{}}
                after={{ l1_process: 'Critical settlement' }}
                derivedImpact={{
                    before: null,
                    after: { cif: 'yes', criticality_class: 'critical' },
                }}
            />,
        );

        expect(screen.getByText('Critical settlement')).toBeInTheDocument();
        expect(screen.getAllByText('Not set').length).toBeGreaterThanOrEqual(2);
        expect(screen.getAllByText('Yes').length).toBeGreaterThan(0);
    });

    it.each([
        ['en', 'Vendor Type', 'ICT', 'Data sensitivity', 'High'],
        ['cs', 'Typ dodavatele', 'ICT', 'Citlivost dat', 'Vysoká'],
    ] as const)(
        'renders localized governed Vendor fields and controlled values in %s',
        async (locale, vendorTypeLabel, vendorType, sensitivityLabel, sensitivity) => {
            await changeLanguage(locale);
            render(
                <GovernedMutationDiff
                    mutationKind="vendor.edit"
                    before={{ vendor_type: 'outsourcing', data_sensitivity: 'low' }}
                    after={{ vendor_type: 'ict', data_sensitivity: 'high' }}
                    derivedImpact={{
                        before: { tier: 'standard' },
                        after: { tier: 'critical' },
                    }}
                />,
            );

            expect(screen.getByText(vendorTypeLabel)).toBeInTheDocument();
            expect(screen.getByText(vendorType)).toBeInTheDocument();
            expect(screen.getByText(sensitivityLabel)).toBeInTheDocument();
            expect(screen.getByText(sensitivity)).toBeInTheDocument();
        },
    );

    it('renders the safe nested Contract snapshot without exposing child identifiers', () => {
        render(
            <GovernedMutationDiff
                mutationKind="vendor.contract.edit"
                before={{ child_mutation: { contract_reference: 'CTR-OLD', internal_contract_number: '7315' } }}
                after={{ child_mutation: { contract_reference: 'CTR-NEW', internal_contract_number: '8124' } }}
                derivedImpact={{
                    before: { tier: 'critical' },
                    after: { tier: 'critical' },
                }}
            />,
        );

        expect(screen.getByText('Contract reference (RoI)')).toBeInTheDocument();
        expect(screen.getByText('CTR-OLD')).toBeInTheDocument();
        expect(screen.getByText('CTR-NEW')).toBeInTheDocument();
        expect(screen.queryByText('Restricted change')).not.toBeInTheDocument();
    });

    it.each([
        ['en', 'Application', 'Cloud', 'Confidential', 'Operational'],
        ['cs', 'Aplikace', 'Cloud', 'Důvěrná data', 'V provozu'],
    ] as const)(
        'renders every mutable Asset field as an intelligible authorized diff in %s',
        async (locale, assetType, deployment, classification, lifecycle) => {
            await changeLanguage(locale);
            render(
                <GovernedMutationDiff
                    mutationKind="asset.edit"
                    before={{
                        name: 'Claims v1',
                        asset_type: 'database',
                        asset_level: 'supporting',
                        description: 'Old description',
                        physical_location: 'Prague',
                        deployment_model: 'on_premise',
                        alternative_names: 'Legacy claims',
                        business_owner_user_id: 'Alice Business Owner',
                        ict_owner_user_id: 'Bob ICT Owner',
                        owning_department_id: 'OPS — Operations',
                        gdpr_relevance: 'no',
                        ai_relevance: 'no',
                        data_classification: 'internal',
                        confidentiality_rating: 2,
                        integrity_rating: 2,
                        availability_rating: 3,
                        authenticity_rating: 2,
                        impact_client: 2,
                        impact_regulatory: 2,
                        substitutability_rating: 2,
                        vendor_dependency_rating: 2,
                        internet_exposed: 'no',
                        preliminary_criticality: 'medium',
                        lifecycle_state: 'in_development',
                        standard_support_end_date: '2027-01-01',
                        extended_support_end_date: '2028-01-01',
                        custom_support_end_date: '2029-01-01',
                        last_legacy_risk_assessment_date: '2026-01-01',
                        review_state: 'review_required',
                        notes: 'Old note',
                    }}
                    after={{
                        name: 'Claims v2',
                        asset_type: 'application',
                        asset_level: 'primary',
                        description: 'New description',
                        physical_location: 'Brno',
                        deployment_model: 'cloud',
                        alternative_names: 'Claims core',
                        business_owner_user_id: 'Carol Business Owner',
                        ict_owner_user_id: 'Dan ICT Owner',
                        owning_department_id: 'ICT — Technology',
                        gdpr_relevance: 'yes',
                        ai_relevance: 'yes',
                        data_classification: 'confidential',
                        confidentiality_rating: 4,
                        integrity_rating: 4,
                        availability_rating: 5,
                        authenticity_rating: 4,
                        impact_client: 4,
                        impact_regulatory: 4,
                        substitutability_rating: 4,
                        vendor_dependency_rating: 4,
                        internet_exposed: 'yes',
                        preliminary_criticality: 'critical',
                        lifecycle_state: 'operational',
                        standard_support_end_date: '2030-01-01',
                        extended_support_end_date: '2031-01-01',
                        custom_support_end_date: '2032-01-01',
                        last_legacy_risk_assessment_date: '2026-07-19',
                        review_state: 'reviewed',
                        notes: 'New note',
                    }}
                    derivedImpact={{
                        before: { cif: 'no', resulting_criticality: 'medium' },
                        after: { cif: 'yes', resulting_criticality: 'critical' },
                    }}
                />,
            );

            expect(screen.queryByText('Restricted change')).not.toBeInTheDocument();
            expect(screen.getByText(assetType)).toBeInTheDocument();
            expect(screen.getByText(deployment)).toBeInTheDocument();
            expect(screen.getByText(classification)).toBeInTheDocument();
            expect(screen.getByText(lifecycle)).toBeInTheDocument();
            for (const rawId of ['7315', '8124', '42', '84']) {
                expect(screen.queryByText(rawId)).not.toBeInTheDocument();
            }
        },
    );
});
