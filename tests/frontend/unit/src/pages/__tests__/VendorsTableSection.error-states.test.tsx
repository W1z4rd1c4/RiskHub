import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Vendor } from '@/types/vendor';
import type { CollectionGroup } from '@/types/collection';

// Slice B (N17 / C4): see RisksTableSection.error-states for the contract narrative.

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count?: number }) =>
            typeof options?.count === 'number' ? `${key}:${options.count}` : key,
        i18n: { language: 'en' },
    }),
}));

import { VendorsTableSection } from '@/pages/vendors/VendorsTableSection';

function makeVendor(overrides: Partial<Vendor> = {}): Vendor {
    return {
        id: 1,
        name: 'Alpha Vendor',
        process: 'Cloud hosting',
        department_name: 'Operations',
        outsourcing_owner_user_id: 1,
        outsourcing_owner_name: 'Owner',
        linked_risks: [],
        vendor_type: 'cloud',
        risk_score_1_5: 3,
        supports_important_core_insurance_function: false,
        dora_relevant: false,
        is_significant_vendor: false,
        has_alternative_providers: false,
        is_archived: false,
        ...overrides,
    } as Vendor;
}

function renderSection(overrides: Partial<React.ComponentProps<typeof VendorsTableSection>> = {}) {
    const props: React.ComponentProps<typeof VendorsTableSection> = {
        currentPage: 1,
        errorKey: null,
        groups: [],
        hasLoadedOnce: true,
        isLoading: false,
        items: [],
        itemsPerPage: 25,
        onBackFromGroup: vi.fn(),
        onPageChange: vi.fn(),
        onRestoreVendor: vi.fn(),
        onRetry: vi.fn(),
        onRowClick: vi.fn(),
        onSelectGroup: vi.fn(),
        onSortChange: vi.fn(),
        sortDirection: null,
        sortField: null,
        selectedGroupLabel: null,
        selectedGroupValue: null,
        totalCount: 0,
        totalPages: 1,
        viewMode: 'all',
        ...overrides,
    };
    return { props, ...render(<MemoryRouter><VendorsTableSection {...props} /></MemoryRouter>) };
}

describe('VendorsTableSection error/loading states (N17)', () => {
    it('[characterization] first-load error replaces the table (not empty) and offers retry', async () => {
        const onRetry = vi.fn();
        renderSection({ errorKey: 'load_failed', items: [], onRetry });
        expect(screen.queryByText('empty_state.no_vendors')).not.toBeInTheDocument();
        await userEvent.setup().click(screen.getByRole('button'));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('[characterization] a successful empty result shows the empty message', () => {
        renderSection({ errorKey: null, items: [] });
        expect(screen.getByText('empty_state.no_vendors')).toBeInTheDocument();
    });

    it('[stale-data] a refetch failure while rows are present keeps rows + shows a banner', () => {
        renderSection({ errorKey: 'load_failed', items: [makeVendor({ name: 'Alpha Vendor' })], totalCount: 1 });
        expect(screen.getByText('Alpha Vendor')).toBeInTheDocument();
        expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('[stale-data:grouped] a refetch failure keeps grouped data and shows a single banner', () => {
        const groups: CollectionGroup[] = [{ value: 'ops', label: 'Operations', count: 2 }];
        renderSection({ errorKey: 'load_failed', groups, items: [makeVendor()], totalCount: 2, viewMode: 'department' });
        expect(screen.getByText('Items')).toBeInTheDocument();
        expect(screen.getAllByRole('alert')).toHaveLength(1);
    });
});
