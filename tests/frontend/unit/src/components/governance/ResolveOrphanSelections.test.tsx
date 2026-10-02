import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ResolveOrphanDepartmentSelection } from '@/components/governance/ResolveOrphanDepartmentSelection';
import { ResolveOrphanOwnerSelection } from '@/components/governance/ResolveOrphanOwnerSelection';
import { ResolveOrphanRiskSelection } from '@/components/governance/ResolveOrphanRiskSelection';
import type { OrphanDepartmentOption, OrphanUserOption } from '@/components/governance/resolveOrphanHelpers';
import type { RiskSummary } from '@/types/risk';

/**
 * GAP-D-13: the orphan-resolution pickers are single-selection radiogroups named by their
 * section heading, with the choice exposed to assistive technology and a search that
 * filters everything out announced as an empty state.
 */
const users: OrphanUserOption[] = [
    { id: 7, name: 'Ops Owner', email: 'ops@example.com', department_id: 3, department_name: 'Operations', employee_type: 'head' },
    { id: 8, name: 'Fin Owner', email: 'fin@example.com', department_id: 4, department_name: 'Finance' },
];
const departments: OrphanDepartmentOption[] = [
    { id: 3, name: 'Operations', code: 'OPS' },
    { id: 4, name: 'Finance', code: 'FIN' },
];
const risks = [
    { id: 77, name: 'Target Risk', description: 'Risk target' },
    { id: 78, name: 'Other Risk', description: 'Another one' },
] as unknown as RiskSummary[];

describe('ResolveOrphanOwnerSelection', () => {
    function renderOwner(overrides: Partial<Parameters<typeof ResolveOrphanOwnerSelection>[0]> = {}) {
        const props = {
            handleSelectUser: vi.fn(),
            orphanDepartmentName: 'Operations',
            searchQuery: '',
            selectedDeptFilter: null,
            selectedUserId: 8,
            setSearchQuery: vi.fn(),
            setSelectedDeptFilter: vi.fn(),
            sortedUsers: users,
            ...overrides,
        };
        render(<ResolveOrphanOwnerSelection {...props} />);
        return props;
    }

    it('exposes the chosen owner in a radiogroup named by its heading', async () => {
        const props = renderOwner();
        const user = userEvent.setup();

        const group = screen.getByRole('radiogroup', { name: 'Assign New Owner' });
        const radios = screen.getAllByRole('radio');
        expect(group).toContainElement(radios[0]);
        expect(radios).toHaveLength(2);
        expect(screen.getByRole('radio', { name: /Fin Owner.*fin@example.com/ })).toBeChecked();
        expect(screen.getByRole('radio', { name: /Ops Owner.*ops@example.com/ })).not.toBeChecked();

        await user.click(screen.getByRole('radio', { name: /Ops Owner.*ops@example.com/ }));
        expect(props.handleSelectUser).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    });

    it('announces an empty result instead of leaving an empty box', () => {
        renderOwner({ sortedUsers: [], selectedUserId: null });

        expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('No users found');
    });

    it('toggles the orphan department filter as a pressed-state button', async () => {
        const props = renderOwner();
        const user = userEvent.setup();

        const filter = screen.getByRole('button', { name: 'Operations' });
        expect(filter).toHaveAttribute('aria-pressed', 'false');
        await user.click(filter);
        expect(props.setSelectedDeptFilter).toHaveBeenCalledWith('Operations');
    });
});

describe('ResolveOrphanDepartmentSelection', () => {
    function renderDepartments(overrides: Partial<Parameters<typeof ResolveOrphanDepartmentSelection>[0]> = {}) {
        const props = {
            departments,
            isSearchable: true,
            searchQuery: '',
            selectedDepartmentId: 4,
            setSearchQuery: vi.fn(),
            setSelectedDepartmentId: vi.fn(),
            ...overrides,
        };
        render(<ResolveOrphanDepartmentSelection {...props} />);
        return props;
    }

    it('marks the selected department (not by colour alone) and selects with the keyboard-native radio', async () => {
        const props = renderDepartments();
        const user = userEvent.setup();

        expect(screen.getByRole('radiogroup', { name: 'Select Department' })).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: /FIN Finance/ })).toBeChecked();
        expect(screen.getByRole('radio', { name: /OPS Operations/ })).not.toBeChecked();

        screen.getByRole('radio', { name: /OPS Operations/ }).focus();
        await user.keyboard(' ');
        expect(props.setSelectedDepartmentId).toHaveBeenCalledWith(3);
    });

    it('announces a search with no match', () => {
        renderDepartments({ departments: [], selectedDepartmentId: null });

        expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('No results found');
    });
});

describe('ResolveOrphanRiskSelection', () => {
    function renderRisks(overrides: Partial<Parameters<typeof ResolveOrphanRiskSelection>[0]> = {}) {
        const props = {
            filteredRisks: risks,
            riskSearchQuery: '',
            selectedRiskDept: '',
            selectedRiskId: 77,
            setRiskSearchQuery: vi.fn(),
            setSelectedRiskDept: vi.fn(),
            setSelectedRiskId: vi.fn(),
            uniqueDepartments: ['Operations'],
            ...overrides,
        };
        render(<ResolveOrphanRiskSelection {...props} />);
        return props;
    }

    it('lists the risks as one radiogroup, every option a real radio (no stray untyped button)', async () => {
        const props = renderRisks();
        const user = userEvent.setup();

        expect(screen.getByRole('radiogroup', { name: /Link/i })).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: /Target Risk/ })).toBeChecked();
        await user.click(screen.getByRole('radio', { name: /Other Risk/ }));
        expect(props.setSelectedRiskId).toHaveBeenCalledWith(78);
    });

    it('names the department filter and announces an empty list', () => {
        renderRisks({ filteredRisks: [], selectedRiskId: null });

        expect(screen.getByRole('combobox', { name: 'All Departments' })).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('No risks found');
    });
});
