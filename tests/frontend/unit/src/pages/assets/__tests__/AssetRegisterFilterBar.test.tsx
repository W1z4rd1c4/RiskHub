import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AssetRegisterFilterBar } from '@/pages/assets/AssetRegisterFilterBar';
import { EMPTY_ASSET_REGISTER_FILTERS } from '@/pages/assets/assetRegisterConfig';

const mocks = vi.hoisted(() => ({ getLookupOptions: vi.fn() }));
vi.mock('@/services/assetApi', () => ({ assetApi: { getLookupOptions: mocks.getLookupOptions } }));

describe('AssetRegisterFilterBar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getLookupOptions.mockResolvedValue([
            { id: 42, label: 'Alice Example', secondary_label: 'Risk · Business Owner', disabled: false, count: 1 },
        ]);
    });

    it('resolves selected remote IDs into safe display metadata', async () => {
        render(<AssetRegisterFilterBar facets={{}} filters={{ ...EMPTY_ASSET_REGISTER_FILTERS, business_owner_ids: [42] }} isLoading={false} onClearAll={vi.fn()} onFilterChange={vi.fn()} onRefresh={vi.fn()} onSearchChange={vi.fn()} search="" />);
        await waitFor(() => expect(mocks.getLookupOptions).toHaveBeenCalledWith('business-owners', expect.objectContaining({ selectedIds: [42] })));
        expect(await screen.findByText('Alice Example')).toBeInTheDocument();
        expect(screen.queryByText('42')).not.toBeInTheDocument();
        expect(screen.getByTestId('assets-filter-chip-business_owner_ids')).toBeInTheDocument();
    });

    it('adds a localized facet, disables zero options, and clears centrally', () => {
        const onClearAll = vi.fn();
        const onFilterChange = vi.fn();
        const { rerender } = render(<AssetRegisterFilterBar facets={{ asset_type: [
            { value: 'application', label: 'Application', count: 3, disabled: false, selected: false },
            { value: 'database', label: 'Database', count: 0, disabled: true, selected: false },
        ] }} filters={EMPTY_ASSET_REGISTER_FILTERS} isLoading={false} onClearAll={onClearAll} onFilterChange={onFilterChange} onRefresh={vi.fn()} onSearchChange={vi.fn()} search="" />);
        fireEvent.change(screen.getByTestId('assets-add-filter'), { target: { value: 'asset_types' } });
        expect(screen.getByRole('checkbox', { name: /Database/ })).toBeDisabled();
        fireEvent.click(screen.getByRole('checkbox', { name: /Application/ }));
        expect(onFilterChange).toHaveBeenCalledWith('asset_types', ['application']);
        rerender(<AssetRegisterFilterBar facets={{}} filters={{ ...EMPTY_ASSET_REGISTER_FILTERS, asset_types: ['application'] }} isLoading={false} onClearAll={onClearAll} onFilterChange={onFilterChange} onRefresh={vi.fn()} onSearchChange={vi.fn()} search="" />);
        fireEvent.click(screen.getByTestId('assets-clear-filters'));
        expect(onClearAll).toHaveBeenCalledOnce();
    });

    it('uses backend Boolean facet counts and keeps a selected zero-count value removable', () => {
        const onFilterChange = vi.fn();
        render(<AssetRegisterFilterBar facets={{ cif: [
            { value: 'yes', label: 'yes', count: 0, disabled: true, selected: true },
            { value: 'no', label: 'no', count: 0, disabled: true, selected: false },
        ] }} filters={{ ...EMPTY_ASSET_REGISTER_FILTERS, cif: true }} isLoading={false} onClearAll={vi.fn()} onFilterChange={onFilterChange} onRefresh={vi.fn()} onSearchChange={vi.fn()} search="" />);

        const select = screen.getByTestId('assets-filter-control-cif').querySelector('select');
        expect(select).not.toBeNull();
        expect(screen.getByRole('option', { name: /Yes \(0\)/i })).toBeEnabled();
        expect(screen.getByRole('option', { name: /No \(0\)/i })).toBeDisabled();

        fireEvent.change(select!, { target: { value: '' } });
        expect(onFilterChange).toHaveBeenCalledWith('cif', null);
    });
});
