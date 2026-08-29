import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RegisterListToolbar } from '@/components/ict-register/RegisterListToolbar';

function renderToolbar(isLoading = false) {
    const onAddFilter = vi.fn();
    const onRefresh = vi.fn();
    const onRemoveFilter = vi.fn();
    render(
        <RegisterListToolbar
            activeFilterCount={1}
            availableFilters={[{ value: 'owner', label: 'Owner' }]}
            chips={[{ key: 'status', label: 'Status: Active' }]}
            clearAllLabel="Clear all"
            filterCountLabel="1 active filter"
            filtersLabel="Add filter"
            isLoading={isLoading}
            lifecycleControl={<button type="button">Lifecycle</button>}
            onAddFilter={onAddFilter}
            onClearAll={() => {}}
            onRefresh={onRefresh}
            onRemoveFilter={onRemoveFilter}
            onSearchChange={() => {}}
            refreshLabel="Refresh register"
            removeFilterLabel={(label) => `Remove ${label}`}
            search=""
            searchPlaceholder="Search risks"
            testIdPrefix="risks"
        />,
    );
    return { onAddFilter, onRefresh, onRemoveFilter };
}

describe('RegisterListToolbar public contract', () => {
    it('keeps search and the native add-filter selector named and operational', () => {
        const { onAddFilter } = renderToolbar();

        expect(screen.getByRole('searchbox', { name: 'Search risks' })).toBeInTheDocument();
        const addFilter = screen.getByRole('combobox', { name: 'Add filter' });
        fireEvent.change(addFilter, { target: { value: 'owner' } });
        expect(onAddFilter).toHaveBeenCalledWith('owner');
    });

    it('shows the visible Add filter control focus when keyboard focus reaches its native selector', async () => {
        const user = userEvent.setup();
        renderToolbar();
        const lifecycle = screen.getByRole('button', { name: 'Lifecycle' });
        const addFilter = screen.getByRole('combobox', { name: 'Add filter' });
        const visibleControl = addFilter.parentElement;
        expect(visibleControl).not.toBeNull();

        lifecycle.focus();
        await user.tab();

        expect(addFilter).toHaveFocus();
        expect(visibleControl!.matches(':focus-within')).toBe(true);
    });

    it('uses the shared loading contract for refresh and preserves named chip actions', () => {
        const { onRemoveFilter } = renderToolbar(true);

        const refresh = screen.getByRole('button', { name: 'Refresh register' });
        expect(refresh).toBeDisabled();
        expect(refresh).toHaveAttribute('aria-busy', 'true');

        fireEvent.click(screen.getByRole('button', { name: 'Remove Status: Active' }));
        expect(onRemoveFilter).toHaveBeenCalledWith('status');
    });
});
