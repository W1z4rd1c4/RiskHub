import { describe, expect, it } from 'vitest';

import { filterUsers, collectRiskFilterOptions, filterRisks, getUniqueRoles } from '@/components/control-form/controlFormFilters';
import { getControlFormStepError, getControlFormSubmissionError } from '@/components/control-form/controlFormValidation';
import type { UserLookupItem } from '@/services/lookupApi';
import type { RiskSummary } from '@/types/risk';

const translate = (key: string) => key;

function createRisk(overrides: Partial<RiskSummary> = {}): RiskSummary {
    return {
        id: 1,
        risk_id_code: 'RISK-001',
        name: 'Payments outage',
        process: 'Payments',
        description: 'Payment flow risk',
        category: 'Operational',
        department_id: 1,
        department_name: 'Finance',
        owner_id: 1,
        owner_name: 'Owner',
        risk_type: 'operational',
        status: 'active',
        gross_probability: 3,
        gross_impact: 3,
        net_probability: 2,
        net_impact: 2,
        gross_score: 9,
        net_score: 4,
        controls_count: 0,
        kris_count: 0,
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
        ...overrides,
    };
}

function createUser(overrides: Partial<UserLookupItem> = {}): UserLookupItem {
    return {
        id: 1,
        name: 'Alex Owner',
        email: 'alex@example.com',
        role_name: 'Manager',
        department_id: 1,
        department_name: 'Finance',
        ...overrides,
    };
}

describe('Control form helpers', () => {
    it('collects sorted unique risk filter options', () => {
        const options = collectRiskFilterOptions([
            createRisk({ department_name: 'Operations', process: 'Ops', category: 'Technology' }),
            createRisk({ id: 2, department_name: 'Finance', process: 'Payments', category: 'Operational' }),
            createRisk({ id: 3, department_name: 'Finance', process: 'Ops', category: 'Technology' }),
        ]);

        expect(options.uniqueDepartments).toEqual(['Finance', 'Operations']);
        expect(options.uniqueProcesses).toEqual(['Ops', 'Payments']);
        expect(options.uniqueCategories).toEqual(['Operational', 'Technology']);
    });

    it('filters risks by search and dropdown state', () => {
        const risks = [
            createRisk(),
            createRisk({ id: 2, name: 'Vendor concentration', department_name: 'Procurement', process: 'Vendors' }),
        ];

        expect(
            filterRisks(risks, {
                riskSearch: 'vendor',
                selectedDept: 'Procurement',
                selectedProcess: 'Vendors',
                selectedCategory: '',
            }),
        ).toHaveLength(1);
    });

    it('filters owners by role and selected department', () => {
        const users = [
            createUser(),
            createUser({ id: 2, name: 'Sam Analyst', role_name: 'Analyst', department_id: 2 }),
        ];

        expect(
            filterUsers(users, {
                ownerSearch: '',
                roleFilter: 'Manager',
                departmentId: 1,
            }),
        ).toEqual([users[0]]);
        expect(getUniqueRoles(users)).toEqual(['Manager', 'Analyst']);
    });

    it('returns the first missing required step error', () => {
        expect(
            getControlFormStepError(
                1,
                {
                    name: 'Control',
                    description: 'Desc',
                },
                translate,
            ),
        ).toBe('controls:form.validation.owner_required');
    });

    it('validates required submit steps in order', () => {
        expect(
            getControlFormSubmissionError(
                {
                    name: 'Control',
                    description: 'Desc',
                    control_owner_id: 1,
                    process_owner_position: 'Manager',
                    department_id: 1,
                    data_source: '',
                },
                translate,
            ),
        ).toBe('controls:form.validation.data_source_required');
    });
});
