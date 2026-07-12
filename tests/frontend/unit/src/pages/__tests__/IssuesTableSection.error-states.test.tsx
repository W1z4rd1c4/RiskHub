import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { IssueSummary } from '@/types/issue';
import type { CollectionGroup } from '@/types/collection';

// Slice B (N17 / C4): see RisksTableSection.error-states for the contract narrative.

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count?: number }) =>
            typeof options?.count === 'number' ? `${key}:${options.count}` : key,
        i18n: { language: 'en' },
    }),
}));

import { IssuesTableSection } from '@/pages/issues/IssuesTableSection';

function makeIssue(overrides: Partial<IssueSummary> = {}): IssueSummary {
    return {
        id: 1,
        title: 'Alpha Issue',
        severity: 'high',
        status: 'open',
        source_type: 'manual',
        source_id: null,
        source_display: null,
        department_id: 1,
        department_name: 'Operations',
        owner_user_id: null,
        owner_user_name: null,
        opened_at: '2026-01-01T00:00:00Z',
        due_at: null,
        closed_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        risk_contexts: [],
        vendor_contexts: [],
        ...overrides,
    } as IssueSummary;
}

function renderSection(overrides: Partial<React.ComponentProps<typeof IssuesTableSection>> = {}) {
    const props: React.ComponentProps<typeof IssuesTableSection> = {
        currentPage: 1,
        errorKey: null,
        groups: [],
        hasLoadedOnce: true,
        isLoading: false,
        items: [],
        itemsPerPage: 25,
        onBackFromGroup: vi.fn(),
        onPageChange: vi.fn(),
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
    return { props, ...render(<MemoryRouter><IssuesTableSection {...props} /></MemoryRouter>) };
}

describe('IssuesTableSection error/loading states (N17)', () => {
    it('[characterization] first-load error replaces the table (not empty) and offers retry', async () => {
        const onRetry = vi.fn();
        renderSection({ errorKey: 'errorKeys.load_failed', items: [], onRetry });
        expect(screen.queryByText('list.empty')).not.toBeInTheDocument();
        await userEvent.setup().click(screen.getByRole('button'));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('[characterization] a successful empty result shows the empty message', () => {
        renderSection({ errorKey: null, items: [] });
        expect(screen.getByText('list.empty')).toBeInTheDocument();
    });

    it('[stale-data] a refetch failure while rows are present keeps rows + shows a banner', () => {
        renderSection({ errorKey: 'errorKeys.load_failed', items: [makeIssue({ title: 'Alpha Issue' })], totalCount: 1 });
        expect(screen.getByText('Alpha Issue')).toBeInTheDocument();
        expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('[stale-data:grouped] a refetch failure keeps grouped data and shows a single banner', () => {
        const groups: CollectionGroup[] = [{ value: 'ops', label: 'Operations', count: 2 }];
        renderSection({ errorKey: 'errorKeys.load_failed', groups, items: [makeIssue()], totalCount: 2, viewMode: 'department' });
        expect(screen.getByText('Items')).toBeInTheDocument();
        expect(screen.getAllByRole('alert')).toHaveLength(1);
    });
});
