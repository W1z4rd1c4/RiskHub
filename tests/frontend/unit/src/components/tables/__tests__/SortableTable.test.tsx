import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SortableTable, type Column, type SortDirection } from '@/components/tables/SortableTable';
import i18n from '@/i18n';

interface Row {
    id: number;
    name: string;
    score: number;
}

const rows: Row[] = [
    { id: 1, name: 'Alpha', score: 3 },
    { id: 2, name: 'Bravo', score: 1 },
];

const columns: Column<Row>[] = [
    { key: 'name', label: 'Name', sortable: true, render: (row) => <span>{row.name}</span> },
    { key: 'score', label: 'Score', sortable: true, render: (row) => <span>{row.score}</span> },
    { key: 'note', label: 'Note', render: () => <span>note</span> },
];

type RenderProps = {
    data?: Row[];
    isLoading?: boolean;
    isError?: boolean;
    onRetry?: () => void;
    errorMessage?: string;
    onRowClick?: (row: Row) => void;
    onSort?: (key: string, direction: SortDirection) => void;
    sortKey?: string | null;
    sortDirection?: SortDirection;
    rowHref?: (row: Row) => string;
    rowLabel?: (row: Row) => string;
    emptyMessage?: string;
};

function renderTable({ data = rows, ...rest }: RenderProps = {}) {
    return render(
        <MemoryRouter>
            <SortableTable data={data} columns={columns} keyExtractor={(row) => row.id} {...rest} />
        </MemoryRouter>,
    );
}

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('SortableTable — keyboard access (FR-P3-1, N18)', () => {
    it('renders sortable headers as buttons inside th[scope=col] with aria-sort', () => {
        renderTable({ sortKey: 'name', sortDirection: 'asc', onSort: vi.fn() });

        const nameHeader = screen.getByRole('columnheader', { name: /name/i });
        expect(nameHeader).toHaveAttribute('scope', 'col');
        expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
        expect(within(nameHeader).getByRole('button', { name: /name/i })).toBeInTheDocument();

        // A sortable column that is not the active sort key reports "none".
        expect(screen.getByRole('columnheader', { name: /score/i })).toHaveAttribute('aria-sort', 'none');
        // A non-sortable column exposes no aria-sort and no button.
        const noteHeader = screen.getByRole('columnheader', { name: /note/i });
        expect(noteHeader).not.toHaveAttribute('aria-sort');
        expect(within(noteHeader).queryByRole('button')).not.toBeInTheDocument();
    });

    it('reflects descending direction in aria-sort', () => {
        renderTable({ sortKey: 'score', sortDirection: 'desc', onSort: vi.fn() });
        expect(screen.getByRole('columnheader', { name: /score/i })).toHaveAttribute('aria-sort', 'descending');
    });

    it('sorts via keyboard activation of the header button (controlled)', async () => {
        const onSort = vi.fn();
        renderTable({ sortKey: null, sortDirection: null, onSort });
        const user = userEvent.setup();

        const nameButton = screen.getByRole('button', { name: /name/i });
        nameButton.focus();
        expect(nameButton).toHaveFocus();
        await user.keyboard('{Enter}');

        expect(onSort).toHaveBeenCalledWith('name', 'asc');
    });

    it('sorts data internally on header click when uncontrolled', async () => {
        renderTable();
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: /score/i }));

        const bodyRows = screen.getAllByRole('row').slice(1); // drop the header row
        expect(within(bodyRows[0]).getByText('Bravo')).toBeInTheDocument(); // score 1 sorts first
    });

    it('renders a focusable "View" link per row as the keyboard path to detail', () => {
        renderTable({ rowHref: (row) => `/rows/${row.id}`, rowLabel: (row) => row.name });

        const alphaLink = screen.getByRole('link', { name: 'View Alpha' });
        expect(alphaLink).toHaveAttribute('href', '/rows/1');
        expect(screen.getByRole('link', { name: 'View Bravo' })).toHaveAttribute('href', '/rows/2');
    });

    it('falls back to a generic view label when rowLabel is omitted', () => {
        renderTable({ rowHref: (row) => `/rows/${row.id}` });
        expect(screen.getAllByRole('link', { name: 'View details' })).toHaveLength(2);
    });

    it('retains row onClick as a mouse convenience', async () => {
        const onRowClick = vi.fn();
        renderTable({ onRowClick });
        const user = userEvent.setup();

        await user.click(screen.getByText('Alpha'));

        expect(onRowClick).toHaveBeenCalledWith(rows[0]);
    });

    it('does not bubble the View-link click to the row onClick', async () => {
        const onRowClick = vi.fn();
        renderTable({ onRowClick, rowHref: (row) => `/rows/${row.id}`, rowLabel: (row) => row.name });
        const user = userEvent.setup();

        await user.click(screen.getByRole('link', { name: 'View Alpha' }));

        expect(onRowClick).not.toHaveBeenCalled();
    });
});

describe('SortableTable — loading skeleton (FR-P3-2, C3)', () => {
    it('renders a column-aware skeleton on first load without flashing an empty state', () => {
        renderTable({ data: [], isLoading: true, emptyMessage: 'Nothing here' });

        const skeleton = screen.getByTestId('sortable-table-skeleton');
        expect(skeleton).toHaveAttribute('aria-busy', 'true');
        // The header is still rendered (column-aware), so no false "empty" flash.
        expect(screen.getByRole('button', { name: /name/i })).toBeInTheDocument();
        expect(screen.queryByText('Nothing here')).not.toBeInTheDocument();
    });

    it('keeps showing held data during a background load (no skeleton over data)', () => {
        renderTable({ data: rows, isLoading: true });

        expect(screen.queryByTestId('sortable-table-skeleton')).not.toBeInTheDocument();
        expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
});

describe('SortableTable — error contract (FR-P3-3, N17, consumes #70)', () => {
    it('replaces the table with an alert block when a fetch fails with no data', async () => {
        const onRetry = vi.fn();
        renderTable({ data: [], isError: true, onRetry, emptyMessage: 'Nothing here' });
        const user = userEvent.setup();

        expect(screen.getByRole('alert')).toBeInTheDocument();
        // A failed fetch MUST NOT render as "empty".
        expect(screen.queryByText('Nothing here')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('keeps stale rows and surfaces a retry banner when a refetch fails', async () => {
        const onRetry = vi.fn();
        renderTable({ data: rows, isError: true, onRetry });
        const user = userEvent.setup();

        expect(screen.getByRole('alert')).toBeInTheDocument(); // banner
        expect(screen.getByText('Alpha')).toBeInTheDocument(); // last-good rows retained
        expect(screen.getByText('Bravo')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('honours the errorMessage override in the error block', () => {
        renderTable({ data: [], isError: true, onRetry: vi.fn(), errorMessage: 'Custom failure' });
        expect(screen.getByText('Custom failure')).toBeInTheDocument();
    });

    it('shows the empty message when there is no data and no load/error in flight', () => {
        renderTable({ data: [], emptyMessage: 'Nothing here' });
        expect(screen.getByText('Nothing here')).toBeInTheDocument();
    });

    it('localizes the default error message for Czech', async () => {
        await i18n.changeLanguage('cs');
        renderTable({ data: [], isError: true, onRetry: vi.fn() });
        expect(
            screen.getByText('Tuto tabulku se nepodařilo načíst. Zkuste to prosím znovu.'),
        ).toBeInTheDocument();
    });
});
