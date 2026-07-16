import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThreatRegisterFilterBar } from '@/pages/threats/ThreatRegisterFilterBar';
import { EMPTY_THREAT_REGISTER_FILTERS } from '@/pages/threats/threatRegisterConfig';

const mocks = vi.hoisted(() => ({ getLookupOptions: vi.fn() }));
vi.mock('@/services/threatApi', () => ({ threatApi: { getLookupOptions: mocks.getLookupOptions } }));

describe('ThreatRegisterFilterBar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getLookupOptions.mockResolvedValue([
            { id: 42, label: 'Klára Černá', secondary_label: 'CISO', disabled: false, count: 1 },
        ]);
    });

    it('renders selected steward metadata and never exposes the raw database ID', async () => {
        render(
            <ThreatRegisterFilterBar
                facets={{}}
                filters={{ ...EMPTY_THREAT_REGISTER_FILTERS, steward_ids: [42] }}
                isLoading={false}
                onClearAll={vi.fn()}
                onFilterChange={vi.fn()}
                onRefresh={vi.fn()}
                onSearchChange={vi.fn()}
                search=""
            />,
        );

        await waitFor(() => expect(mocks.getLookupOptions).toHaveBeenCalledWith(
            'stewards',
            expect.objectContaining({ selectedIds: [42] }),
        ));
        expect(await screen.findByText('Klára Černá')).toBeInTheDocument();
        expect(screen.queryByText('42')).not.toBeInTheDocument();
        expect(screen.getByTestId('threats-filter-chip-steward_ids')).toBeInTheDocument();
    });

    it('keeps canonical zero-result categories disabled and supports Boolean false', () => {
        const onFilterChange = vi.fn();
        render(
            <ThreatRegisterFilterBar
                facets={{
                    category: [
                        { value: 'availability', label: 'availability', count: 0, disabled: true, selected: false },
                        { value: 'integrity', label: 'integrity', count: 2, disabled: false, selected: false },
                    ],
                    has_linked_risk: [
                        { value: 'yes', label: 'yes', count: 2, disabled: false, selected: false },
                        { value: 'no', label: 'no', count: 1, disabled: false, selected: false },
                    ],
                }}
                filters={EMPTY_THREAT_REGISTER_FILTERS}
                isLoading={false}
                onClearAll={vi.fn()}
                onFilterChange={onFilterChange}
                onRefresh={vi.fn()}
                onSearchChange={vi.fn()}
                search=""
            />,
        );

        fireEvent.change(screen.getByTestId('threats-add-filter'), { target: { value: 'categories' } });
        expect(screen.getByRole('checkbox', { name: /Availability/ })).toBeDisabled();
        fireEvent.click(screen.getByRole('checkbox', { name: /Integrity/ }));
        expect(onFilterChange).toHaveBeenCalledWith('categories', ['integrity']);

        fireEvent.change(screen.getByTestId('threats-add-filter'), { target: { value: 'has_linked_risk' } });
        fireEvent.change(screen.getByTestId('threats-filter-control-has_linked_risk').querySelector('select')!, {
            target: { value: 'false' },
        });
        expect(onFilterChange).toHaveBeenCalledWith('has_linked_risk', false);
    });
});
