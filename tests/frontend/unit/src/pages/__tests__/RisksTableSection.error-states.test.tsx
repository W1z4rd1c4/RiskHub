import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { RiskSummary } from '@/types/risk';
import type { CollectionGroup } from '@/types/collection';

// Slice B (N17 / C4): the query-owning `viewMode === 'all'` render must let the shared
// table-error contract drive loading + error, so a refetch failure while rows are held
// keeps the rows + a retry banner instead of blanking the table. Characterization tests
// pin the preserved first-load-error (replace) and empty-result behaviour; the stale-data
// tests are red on the pre-migration code (bespoke `if (errorKey)` full-replace) and green
// after.

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count?: number }) =>
            typeof options?.count === 'number' ? `${key}:${options.count}` : key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/hooks/usePendingApprovalIds', () => ({
    usePendingApprovalIds: () => new Set<number>(),
}));

vi.mock('@/hooks/useRiskHubConfig', () => ({
    useRiskThresholds: () => ({ thresholds: { critical: 16, high: 10, medium: 5 }, getScoreColor: () => '' }),
    useRiskTypes: () => ({
        getColor: () => '#64748b',
        getDisplayName: (code: string) => code,
        getInitials: (code: string) => code.slice(0, 2).toUpperCase(),
    }),
}));

import { RisksTableSection } from '@/pages/risks/RisksTableSection';

function makeRisk(overrides: Partial<RiskSummary> = {}): RiskSummary {
    return {
        id: 1,
        risk_id_code: 'R-1',
        name: 'Alpha Risk',
        process: 'Procurement',
        risk_type: 'operational',
        description: 'desc',
        gross_score: 6,
        gross_probability: 2,
        gross_impact: 3,
        net_score: 4,
        status: 'active',
        is_archived: false,
        is_priority: false,
        ...overrides,
    };
}

function renderSection(overrides: Partial<React.ComponentProps<typeof RisksTableSection>> = {}) {
    const props: React.ComponentProps<typeof RisksTableSection> = {
        currentPage: 1,
        errorKey: null,
        hasLoadedOnce: true,
        groups: [],
        isLoading: false,
        items: [],
        itemsPerPage: 25,
        onBackFromGroup: vi.fn(),
        onPageChange: vi.fn(),
        onRestoreRisk: vi.fn(),
        onRetry: vi.fn(),
        onRowClick: vi.fn(),
        onSelectGroup: vi.fn(),
        onSortChange: vi.fn(),
        sortDirection: null,
        sortField: null,
        totalCount: 0,
        totalPages: 1,
        selectedGroupLabel: null,
        selectedGroupValue: null,
        viewMode: 'all',
        ...overrides,
    };
    return { props, ...render(<MemoryRouter><RisksTableSection {...props} /></MemoryRouter>) };
}

describe('RisksTableSection error/loading states (N17)', () => {
    it('[characterization] first-load error replaces the table (not an empty state) and offers retry', async () => {
        const onRetry = vi.fn();
        renderSection({ errorKey: 'errors.load_failed', items: [], onRetry });

        // Not rendered as an empty success state.
        expect(screen.queryByText('empty_state.no_risks')).not.toBeInTheDocument();
        // A retry affordance is present and wired.
        const retry = screen.getByRole('button');
        await userEvent.setup().click(retry);
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('[characterization] a successful empty result shows the empty message', () => {
        renderSection({ errorKey: null, items: [], viewMode: 'all' });
        expect(screen.getByText('empty_state.no_risks')).toBeInTheDocument();
    });

    it('[stale-data] a refetch failure while rows are present keeps the rows and shows a banner', () => {
        renderSection({ errorKey: 'errors.load_failed', items: [makeRisk({ name: 'Alpha Risk' })], totalCount: 1 });

        // Rows retained (red on pre-migration code — the bespoke full-replace blanks them).
        expect(screen.getByText('Alpha Risk')).toBeInTheDocument();
        // Non-blocking retry banner surfaced above the stale rows.
        expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('[stale-data:grouped] a refetch failure keeps grouped data and shows a single banner', () => {
        const groups: CollectionGroup[] = [{ value: 'ops', label: 'Operations', count: 2 }];
        renderSection({
            errorKey: 'errors.load_failed',
            groups,
            items: [makeRisk()],
            totalCount: 2,
            viewMode: 'department',
        });

        // Grouped cards retained (red on pre-migration code).
        expect(screen.getByText('Items')).toBeInTheDocument();
        // Exactly one banner.
        expect(screen.getAllByRole('alert')).toHaveLength(1);
    });
});
