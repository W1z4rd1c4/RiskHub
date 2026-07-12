import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ControlSummary } from '@/types/control';
import type { CollectionGroup } from '@/types/collection';

// Slice B (N17 / C4): see RisksTableSection.error-states for the contract narrative.

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

import { ControlsTableSection } from '@/pages/controls/ControlsTableSection';

function makeControl(overrides: Partial<ControlSummary> = {}): ControlSummary {
    return {
        id: 1,
        name: 'Alpha Control',
        frequency: 'monthly',
        risk_level: 3,
        status: 'active',
        is_archived: false,
        control_form: 'attestation',
        monitoring_status: 'passed',
        department_name: 'Operations',
        ...overrides,
    } as ControlSummary;
}

function renderSection(overrides: Partial<React.ComponentProps<typeof ControlsTableSection>> = {}) {
    const props: React.ComponentProps<typeof ControlsTableSection> = {
        currentPage: 1,
        errorKey: null,
        groups: [],
        hasLoadedOnce: true,
        isLoading: false,
        items: [],
        itemsPerPage: 25,
        onBackFromGroup: vi.fn(),
        onPageChange: vi.fn(),
        onRestoreControl: vi.fn(),
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
    return { props, ...render(<MemoryRouter><ControlsTableSection {...props} /></MemoryRouter>) };
}

describe('ControlsTableSection error/loading states (N17)', () => {
    it('[characterization] first-load error replaces the table (not empty) and offers retry', async () => {
        const onRetry = vi.fn();
        renderSection({ errorKey: 'errors.load_failed', items: [], onRetry });
        expect(screen.queryByText('empty_state.no_controls')).not.toBeInTheDocument();
        await userEvent.setup().click(screen.getByRole('button'));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('[characterization] a successful empty result shows the empty message', () => {
        renderSection({ errorKey: null, items: [] });
        expect(screen.getByText('empty_state.no_controls')).toBeInTheDocument();
    });

    it('[stale-data] a refetch failure while rows are present keeps rows + shows a banner', () => {
        renderSection({ errorKey: 'errors.load_failed', items: [makeControl({ name: 'Alpha Control' })], totalCount: 1 });
        expect(screen.getByText('Alpha Control')).toBeInTheDocument();
        expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('[stale-data:grouped] a refetch failure keeps grouped data and shows a single banner', () => {
        const groups: CollectionGroup[] = [{ value: 'ops', label: 'Operations', count: 2 }];
        renderSection({ errorKey: 'errors.load_failed', groups, items: [makeControl()], totalCount: 2, viewMode: 'department' });
        expect(screen.getByText('Items')).toBeInTheDocument();
        expect(screen.getAllByRole('alert')).toHaveLength(1);
    });
});
