import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VendorRegisterFilterBar } from '@/pages/vendors/VendorRegisterFilterBar';
import { EMPTY_VENDOR_REGISTER_FILTERS } from '@/pages/vendors/vendorRegisterConfig';

const mocks = vi.hoisted(() => ({ getLookupOptions: vi.fn() }));
vi.mock('@/services/vendorApi', () => ({ vendorApi: { getLookupOptions: mocks.getLookupOptions } }));

describe('VendorRegisterFilterBar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getLookupOptions.mockResolvedValue([
            {
                id: 42,
                label: 'Alice Example',
                secondary_label: 'alice@example.test · Operations',
                disabled: false,
                count: 1,
            },
        ]);
    });

    it('resolves selected owner IDs into safe display metadata', async () => {
        render(
            <VendorRegisterFilterBar
                facets={{}}
                filters={{ ...EMPTY_VENDOR_REGISTER_FILTERS, outsourcing_owner_ids: [42] }}
                isLoading={false}
                onClearAll={vi.fn()}
                onFilterChange={vi.fn()}
                onRefresh={vi.fn()}
                onSearchChange={vi.fn()}
                search=""
            />,
        );

        await waitFor(() => expect(mocks.getLookupOptions).toHaveBeenCalledWith(
            'outsourcing-owners',
            expect.objectContaining({ selectedIds: [42] }),
        ));
        expect(await screen.findByText('Alice Example')).toBeInTheDocument();
        expect(screen.queryByText('42')).not.toBeInTheDocument();
        expect(screen.getByTestId('vendors-filter-chip-outsourcing_owner_ids')).toBeInTheDocument();
    });

    it('localizes canonical facets, disables zero-result options, and supports Boolean false', () => {
        const onFilterChange = vi.fn();
        render(
            <VendorRegisterFilterBar
                facets={{
                    vendor_type: [
                        { value: 'ict', label: 'ict', count: 2, disabled: false, selected: false },
                        { value: 'partner', label: 'partner', count: 0, disabled: true, selected: false },
                    ],
                    has_sub_outsourcing: [
                        { value: 'yes', label: 'yes', count: 1, disabled: false, selected: false },
                        { value: 'no', label: 'no', count: 3, disabled: false, selected: false },
                    ],
                }}
                filters={EMPTY_VENDOR_REGISTER_FILTERS}
                isLoading={false}
                onClearAll={vi.fn()}
                onFilterChange={onFilterChange}
                onRefresh={vi.fn()}
                onSearchChange={vi.fn()}
                search=""
            />,
        );

        fireEvent.change(screen.getByTestId('vendors-add-filter'), { target: { value: 'vendor_types' } });
        expect(screen.getByTestId('vendors-filter-vendor_types-option-partner')).toBeDisabled();
        fireEvent.click(screen.getByTestId('vendors-filter-vendor_types-option-ict'));
        expect(onFilterChange).toHaveBeenCalledWith('vendor_types', ['ict']);

        fireEvent.change(screen.getByTestId('vendors-add-filter'), { target: { value: 'has_sub_outsourcing' } });
        fireEvent.change(screen.getByTestId('vendors-filter-has_sub_outsourcing-select'), {
            target: { value: 'false' },
        });
        expect(onFilterChange).toHaveBeenCalledWith('has_sub_outsourcing', false);
    });

    it('locks lifecycle to all while the removable Committee population chip is active', () => {
        render(<VendorRegisterFilterBar facets={{}} filters={EMPTY_VENDOR_REGISTER_FILTERS} isLifecycleLocked
            isLoading={false} onClearAll={vi.fn()} onFilterChange={vi.fn()} onRefresh={vi.fn()}
            onSearchChange={vi.fn()} search="" />);
        expect(screen.getByTestId('vendors-status-filter-trigger')).toBeDisabled();
        expect(screen.getByTestId('vendors-status-filter-trigger')).toHaveTextContent(/all/i);
    });
});
