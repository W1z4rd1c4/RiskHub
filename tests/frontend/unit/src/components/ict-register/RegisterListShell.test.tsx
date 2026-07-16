import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { RegisterListShell } from '@/components/ict-register/RegisterListShell';

interface Row {
    id: number;
    name: string;
}

type View = 'all' | 'owner';

const rows: Row[] = [{ id: 1, name: 'Claims' }];

function baseProps() {
    return {
        accessDeniedState: <div>Access denied</div>,
        allView: 'all' as const,
        canExport: true,
        columns: [{ key: 'name', label: 'Name', sortable: true }],
        createLabel: 'New',
        currentPage: 1,
        emptyMessage: 'No processes',
        exportLabel: 'Export',
        isAccessDenied: false,
        isError: false,
        isLoading: false,
        items: rows,
        itemsPerPage: 1,
        onPageChange: vi.fn(),
        onRetry: vi.fn(),
        onViewChange: vi.fn(),
        table: {
            keyExtractor: (row: Row) => row.id,
            sortDirection: null,
            sortKey: null,
            onSort: vi.fn(),
        },
        testIdPrefix: 'processes',
        title: 'Processes',
        subtitle: 'Register',
        toolbar: <div>Filters</div>,
        totalCount: 2,
        totalPages: 2,
        view: 'all' as View,
        views: [
            { value: 'all' as const, label: 'All' },
            { value: 'owner' as const, label: 'By owner' },
        ],
    };
}

function renderShell(overrides: Partial<ReturnType<typeof baseProps>> = {}) {
    const props = { ...baseProps(), ...overrides };
    return render(
        <MemoryRouter>
            <RegisterListShell<Row, View> {...props} />
        </MemoryRouter>,
    );
}

describe('RegisterListShell', () => {
    it('owns ordinary pressed view buttons, the sortable table seam, and pagination', () => {
        const onViewChange = vi.fn();
        const onSort = vi.fn();
        const onPageChange = vi.fn();
        renderShell({
            onPageChange,
            onViewChange,
            table: { ...baseProps().table, onSort },
        });

        expect(screen.getByRole('heading', { name: 'Processes' })).toBeInTheDocument();
        const all = screen.getByRole('button', { name: 'All' });
        expect(all).toHaveAttribute('aria-pressed', 'true');
        expect(all).not.toHaveAttribute('role', 'tab');
        fireEvent.click(screen.getByRole('button', { name: 'By owner' }));
        expect(onViewChange).toHaveBeenCalledWith('owner');

        fireEvent.click(screen.getByRole('button', { name: 'Name' }));
        expect(onSort).toHaveBeenCalledWith('name', 'asc');
        fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
        expect(onPageChange).toHaveBeenCalledWith(2);
        expect(screen.getByText('Claims')).toBeInTheDocument();
        expect(screen.getByText('Filters')).toBeInTheDocument();
    });

    it('owns the grouping drill-down configuration', () => {
        const onSelectGroup = vi.fn();
        renderShell({
            view: 'owner',
            items: [],
            totalCount: 1,
            totalPages: 1,
            grouping: {
                groups: [{ value: 'owner:7', label: 'Alice', count: 1 }],
                onBack: vi.fn(),
                onSelectGroup,
                selectedGroupLabel: null,
                selectedGroupValue: null,
            },
        });

        fireEvent.click(screen.getByTestId('register-group-card'));
        expect(onSelectGroup).toHaveBeenCalledWith('owner:7', 'Alice');
    });

    it('shows the table loading contract while a selected group replaces prior summary groups', () => {
        const grouping = {
            groups: [{ value: 'owner:7', label: 'Alice', count: 1 }],
            onBack: vi.fn(),
            onSelectGroup: vi.fn(),
            selectedGroupLabel: null,
            selectedGroupValue: null,
        };
        const { rerender } = renderShell({
            view: 'owner',
            items: [],
            totalCount: 1,
            totalPages: 1,
            grouping,
        });
        expect(screen.getByTestId('register-group-card')).toBeInTheDocument();

        rerender(
            <MemoryRouter>
                <RegisterListShell<Row, View>
                    {...baseProps()}
                    view="owner"
                    items={[]}
                    totalCount={1}
                    totalPages={1}
                    isLoading
                    grouping={{ ...grouping, selectedGroupLabel: 'Alice', selectedGroupValue: 'owner:7' }}
                />
            </MemoryRouter>,
        );

        expect(screen.getByTestId('sortable-table-skeleton')).toBeInTheDocument();
        expect(screen.queryByText('No processes')).not.toBeInTheDocument();
    });

    it('owns the export trigger and dialog lifecycle', () => {
        renderShell({
            exportDialog: ({ isOpen, onClose }) => isOpen ? (
                <div role="dialog" aria-label="Export processes">
                    <button type="button" onClick={onClose}>Close export</button>
                </div>
            ) : null,
        });

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('processes-export-button'));
        expect(screen.getByRole('dialog', { name: 'Export processes' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Close export' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('owns loading, error/retry, empty, and access-denied rendering', () => {
        const onRetry = vi.fn();
        const { rerender } = renderShell({ items: [], isLoading: true, totalCount: 0, totalPages: 1, onRetry });
        expect(screen.getByTestId('sortable-table-skeleton')).toBeInTheDocument();

        rerender(
            <MemoryRouter>
                <RegisterListShell<Row, View>
                    {...baseProps()}
                    items={[]}
                    totalCount={0}
                    totalPages={1}
                    isError
                    errorMessage="Load failed"
                    onRetry={onRetry}
                />
            </MemoryRouter>,
        );
        expect(screen.getByText('Load failed')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onRetry).toHaveBeenCalledOnce();

        rerender(
            <MemoryRouter>
                <RegisterListShell<Row, View>
                    {...baseProps()}
                    items={[]}
                    totalCount={0}
                    totalPages={1}
                />
            </MemoryRouter>,
        );
        expect(screen.getByText('No processes')).toBeInTheDocument();

        rerender(
            <MemoryRouter>
                <RegisterListShell<Row, View> {...baseProps()} isAccessDenied />
            </MemoryRouter>,
        );
        expect(screen.getByText('Access denied')).toBeInTheDocument();
        expect(screen.queryByTestId('processes-register-shell')).not.toBeInTheDocument();
    });
});
