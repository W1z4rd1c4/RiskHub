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
});
