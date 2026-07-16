import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProcessRegisterFilterBar } from '@/pages/processes/ProcessRegisterFilterBar';
import { EMPTY_PROCESS_REGISTER_FILTERS } from '@/pages/processes/processRegisterConfig';

const mocks = vi.hoisted(() => ({ getLookupOptions: vi.fn() }));
vi.mock('@/services/processApi', () => ({ processApi: { getLookupOptions: mocks.getLookupOptions } }));

describe('ProcessRegisterFilterBar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getLookupOptions.mockResolvedValue([
            { id: 42, label: 'Alice Example', secondary_label: 'Risk · Owner', disabled: false, count: 1 },
        ]);
    });

    it('renders selected remote IDs through safe lookup metadata and never as raw IDs', async () => {
        render(
            <ProcessRegisterFilterBar
                facets={{}}
                filters={{ ...EMPTY_PROCESS_REGISTER_FILTERS, owner_ids: [42] }}
                isLoading={false}
                onClearAll={vi.fn()}
                onFilterChange={vi.fn()}
                onRefresh={vi.fn()}
                onSearchChange={vi.fn()}
                search=""
            />,
        );

        await waitFor(() => expect(mocks.getLookupOptions).toHaveBeenCalledWith('owners', expect.objectContaining({ selectedIds: [42] })));
        expect(await screen.findByText('Alice Example')).toBeInTheDocument();
        expect(screen.queryByText('42')).not.toBeInTheDocument();
        expect(screen.getByTestId('processes-filter-chip-owner_ids')).toBeInTheDocument();
    });

    it('adds an inline facet, keeps canonical zero-result values disabled, and clears centrally', () => {
        const onClearAll = vi.fn();
        const onFilterChange = vi.fn();
        const { rerender } = render(
            <ProcessRegisterFilterBar
                facets={{
                    criticality: [
                        { value: 'critical', label: 'Critical', count: 0, disabled: true, selected: false },
                        { value: 'high', label: 'High', count: 3, disabled: false, selected: false },
                    ],
                }}
                filters={EMPTY_PROCESS_REGISTER_FILTERS}
                isLoading={false}
                onClearAll={onClearAll}
                onFilterChange={onFilterChange}
                onRefresh={vi.fn()}
                onSearchChange={vi.fn()}
                search=""
            />,
        );

        fireEvent.change(screen.getByTestId('processes-add-filter'), { target: { value: 'criticality' } });
        const critical = screen.getByRole('checkbox', { name: /Critical/ });
        expect(critical).toBeDisabled();
        fireEvent.click(screen.getByRole('checkbox', { name: /High/ }));
        expect(onFilterChange).toHaveBeenCalledWith('criticality', ['high']);
        rerender(
            <ProcessRegisterFilterBar
                facets={{}}
                filters={{ ...EMPTY_PROCESS_REGISTER_FILTERS, criticality: ['high'] }}
                isLoading={false}
                onClearAll={onClearAll}
                onFilterChange={onFilterChange}
                onRefresh={vi.fn()}
                onSearchChange={vi.fn()}
                search=""
            />,
        );
        fireEvent.click(screen.getByTestId('processes-clear-filters'));
        expect(onClearAll).toHaveBeenCalledOnce();
    });
});
