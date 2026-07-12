import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { KeyRiskIndicator } from '@/types/kri';
import type { CollectionGroup } from '@/types/collection';

// Slice B (N17 / C4): KRIs owns a bespoke grouped surface (drill-down + group cards)
// rather than CollectionGroupDrillDown, so the parent guard is hoisted manually; the
// query-owning `viewMode === 'all'` render defers to the shared contract. See
// RisksTableSection.error-states for the full narrative.

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count?: number }) =>
            typeof options?.count === 'number' ? `${key}:${options.count}` : key,
        i18n: { language: 'en' },
    }),
}));

import { KRIsTableSection } from '@/pages/kris/KRIsTableSection';

function makeKri(overrides: Partial<KeyRiskIndicator> = {}): KeyRiskIndicator {
    return {
        id: 1,
        risk_id: 1,
        metric_name: 'Alpha KRI',
        description: 'desc',
        current_value: 50,
        lower_limit: 0,
        upper_limit: 100,
        unit: '%',
        breach_status: 'within',
        monitoring_status: 'optimal',
        last_updated: '2026-01-01T00:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
        frequency: 'monthly',
        risk_process: 'Ops',
        risk_description: 'risk desc',
        ...overrides,
    } as KeyRiskIndicator;
}

function renderSection(overrides: Partial<React.ComponentProps<typeof KRIsTableSection>> = {}) {
    const props: React.ComponentProps<typeof KRIsTableSection> = {
        currentPage: 1,
        errorKey: null,
        groups: [],
        hasLoadedOnce: true,
        isLoading: false,
        items: [],
        itemsPerPage: 25,
        onBackFromGroup: vi.fn(),
        onPageChange: vi.fn(),
        onRestoreKri: vi.fn(),
        onRetry: vi.fn(),
        onRowClick: vi.fn(),
        onSelectGroup: vi.fn(),
        selectedGroupLabel: null,
        selectedGroupValue: null,
        totalCount: 0,
        totalPages: 1,
        viewMode: 'all',
        ...overrides,
    };
    return { props, ...render(<MemoryRouter><KRIsTableSection {...props} /></MemoryRouter>) };
}

describe('KRIsTableSection error/loading states (N17)', () => {
    it('[characterization] first-load error replaces the table (not empty) and offers retry', async () => {
        const onRetry = vi.fn();
        renderSection({ errorKey: 'errorKeys.load_failed', items: [], onRetry });
        expect(screen.queryByText('empty_state.no_kris')).not.toBeInTheDocument();
        await userEvent.setup().click(screen.getByRole('button'));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('[characterization] a successful empty result shows the empty message', () => {
        renderSection({ errorKey: null, items: [] });
        expect(screen.getByText('empty_state.no_kris')).toBeInTheDocument();
    });

    it('[stale-data] a refetch failure while rows are present keeps rows + shows a banner', () => {
        renderSection({ errorKey: 'errorKeys.load_failed', items: [makeKri({ metric_name: 'Alpha KRI' })], totalCount: 1 });
        expect(screen.getByText('Alpha KRI')).toBeInTheDocument();
        expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('[stale-data:grouped] a refetch failure keeps grouped data and shows a single banner', () => {
        const groups: CollectionGroup[] = [{ value: 'ops', label: 'Operations', count: 2 }];
        renderSection({ errorKey: 'errorKeys.load_failed', groups, items: [makeKri()], totalCount: 2, viewMode: 'department' });
        expect(screen.getByText('Items')).toBeInTheDocument();
        expect(screen.getAllByRole('alert')).toHaveLength(1);
    });
});
