import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ActivityLogFilterBar, type ActivityLogFilterBarProps } from '@/components/activity-log/ActivityLogFilterBar';

function renderBar(overrides: Partial<ActivityLogFilterBarProps> = {}) {
    const props: ActivityLogFilterBarProps = {
        search: '',
        onSearchChange: vi.fn(),
        action: '',
        onActionChange: vi.fn(),
        actions: ['create', 'status_change', 'brand_new_action'],
        dateFrom: '',
        onDateFromChange: vi.fn(),
        dateTo: '',
        onDateToChange: vi.fn(),
        viewMode: 'chronological',
        onViewModeChange: vi.fn(),
        selectedActorId: null,
        onActorChange: vi.fn(),
        selectedDepartmentId: null,
        onDepartmentChange: vi.fn(),
        selectedRiskId: null,
        onRiskChange: vi.fn(),
        actors: [{ id: 1, name: 'Anna Kowalski' }],
        departments: [{ id: 2, name: 'Operations' }],
        risks: [{ id: 3, name: 'Vendor outage' }],
        canFilterByDepartment: true,
        canViewEntityFilters: true,
        ...overrides,
    };
    render(<ActivityLogFilterBar {...props} />);
    return props;
}

describe('ActivityLogFilterBar', () => {
    it('renders the view modes as a named group of pressed-state toggles', async () => {
        const props = renderBar();
        const user = userEvent.setup();

        const group = screen.getByRole('group', { name: 'Activity view' });
        const chronological = screen.getByRole('button', { name: 'Chronological' });
        const byPerson = screen.getByRole('button', { name: 'By Person' });
        expect(group).toContainElement(chronological);
        expect(chronological).toHaveAttribute('aria-pressed', 'true');
        expect(byPerson).toHaveAttribute('aria-pressed', 'false');

        await user.click(byPerson);
        expect(props.onViewModeChange).toHaveBeenCalledWith('by_person');
    });

    it('names every filter control instead of leaving it placeholder-only (AX-04)', () => {
        renderBar();

        expect(screen.getByRole('textbox', { name: 'Search logs...' })).toHaveAttribute('data-testid', 'activity-log-search-input');
        expect(screen.getByRole('combobox', { name: 'Action' })).toBeInTheDocument();
        expect(screen.getByLabelText('From date')).toHaveAttribute('type', 'date');
        expect(screen.getByLabelText('To date')).toHaveAttribute('type', 'date');
    });

    it('names the entity picker of the active view mode', () => {
        renderBar({ viewMode: 'by_person' });

        expect(screen.getByRole('combobox', { name: 'Select a person...' })).toBeInTheDocument();
    });

    it('lists actions by their translated event label with a humanised fallback (GAP-D-02)', async () => {
        renderBar();
        const user = userEvent.setup();

        await user.click(screen.getByRole('combobox', { name: 'Action' }));

        expect(await screen.findByRole('option', { name: 'Created' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Status changed' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Brand new action' })).toBeInTheDocument();
    });

    it('hides the entity filters without the capability', () => {
        renderBar({ canViewEntityFilters: false });

        expect(screen.queryByTestId('activity-log-search-input')).not.toBeInTheDocument();
    });
});
