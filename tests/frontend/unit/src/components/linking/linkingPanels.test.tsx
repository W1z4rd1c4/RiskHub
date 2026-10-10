import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExistingLinksPanel } from '@/components/linking/ExistingLinksPanel';
import { LinkConfirmationPanel } from '@/components/linking/LinkConfirmationPanel';
import { LinkSearchFilters } from '@/components/linking/LinkSearchFilters';
import { LinkSearchResults } from '@/components/linking/LinkSearchResults';
import i18n from '@/i18n';
import type { SearchResultItem } from '@/components/linking/linkTypes';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(node: Element): Promise<void> {
    const results = await axe.run(node, {
        runOnly: { type: 'tag', values: AXE_TAGS },
        rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('ExistingLinksPanel', () => {
    it('shows the effectiveness as a translated, toned badge instead of the raw code (PG-03)', async () => {
        const { container } = render(
            <ExistingLinksPanel
                mode="risk-to-control"
                existingLinks={[
                    { id: 1, control_id: 11, display_name: 'Four-eyes check', effectiveness: 'high' },
                    { id: 2, control_id: 12, display_name: 'Manual review', effectiveness: 'low' },
                ]}
                onUnlink={vi.fn()}
                isUnlinking={null}
            />,
        );

        const rows = screen.getAllByRole('listitem');
        expect(within(rows[0]).getByText('High')).toHaveAttribute('data-tone', 'success');
        expect(within(rows[1]).getByText('Low')).toHaveAttribute('data-tone', 'danger');
        expect(screen.queryByText('high')).not.toBeInTheDocument();
        await expectNoAxeViolations(container);
    });

    it('translates the effectiveness in Czech and omits the badge for unrated links', async () => {
        await i18n.changeLanguage('cs');
        render(
            <ExistingLinksPanel
                mode="risk-to-control"
                existingLinks={[
                    { id: 1, control_id: 11, display_name: 'Kontrola A', effectiveness: 'medium' },
                    { id: 2, control_id: 12, display_name: 'Kontrola B', effectiveness: 'linked' },
                ]}
                onUnlink={vi.fn()}
                isUnlinking={null}
            />,
        );

        const rows = screen.getAllByRole('listitem');
        expect(within(rows[0]).getByText('Střední')).toHaveAttribute('data-tone', 'warning');
        expect(within(rows[1]).queryByText(/./, { selector: '[data-tone]' })).not.toBeInTheDocument();
    });

    it('names every unlink button after its target and shows a busy state while unlinking', async () => {
        const user = userEvent.setup();
        const onUnlink = vi.fn();
        render(
            <ExistingLinksPanel
                mode="risk-to-control"
                existingLinks={[
                    { id: 1, control_id: 11, display_name: 'Four-eyes check', effectiveness: 'high' },
                    { id: 2, control_id: 12, display_name: 'Manual review', effectiveness: 'low' },
                ]}
                onUnlink={onUnlink}
                isUnlinking={12}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Remove link: Four-eyes check' }));
        expect(onUnlink).toHaveBeenCalledWith(11);
        expect(screen.getByRole('button', { name: 'Remove link: Manual review' })).toBeDisabled();
    });

    it('uses the shared empty state when nothing is linked', () => {
        render(<ExistingLinksPanel mode="risk-to-control" existingLinks={[]} onUnlink={vi.fn()} isUnlinking={null} />);

        expect(screen.getByRole('status')).toHaveAttribute('data-kind', 'no-data');
        expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    });
});

describe('LinkSearchFilters', () => {
    function renderFilters(overrides: Partial<Parameters<typeof LinkSearchFilters>[0]> = {}) {
        const props: Parameters<typeof LinkSearchFilters>[0] = {
            mode: 'risk-to-control',
            searchQuery: '',
            onSearchQueryChange: vi.fn(),
            selectedDeptId: null,
            onDeptIdChange: vi.fn(),
            selectedProcess: '',
            onProcessChange: vi.fn(),
            selectedCategory: '',
            onCategoryChange: vi.fn(),
            includeArchived: false,
            onIncludeArchivedChange: vi.fn(),
            departments: [{ id: 1, name: 'Operations' }],
            processes: ['Payments'],
            categories: ['Operational'],
            isLoadingLookups: false,
            isSearching: false,
            ...overrides,
        };
        return { props, ...render(<LinkSearchFilters {...props} />) };
    }

    it('labels the three filters and the archived toggle instead of relying on placeholders (AX-04)', async () => {
        const { props, container } = renderFilters();

        expect(screen.getByRole('combobox', { name: 'Department' })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Process' })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Category' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Include archived' }));
        expect(props.onIncludeArchivedChange).toHaveBeenCalledWith(true);
        await expectNoAxeViolations(container);
    });

    it('clears every filter with a named button only while a filter is active', async () => {
        const user = userEvent.setup();
        const { props, rerender } = renderFilters();
        expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();

        rerender(<LinkSearchFilters {...props} selectedProcess="Payments" includeArchived />);
        await user.click(screen.getByRole('button', { name: 'Clear' }));
        expect(props.onProcessChange).toHaveBeenCalledWith('');
        expect(props.onIncludeArchivedChange).toHaveBeenCalledWith(false);
    });
});

describe('LinkSearchResults', () => {
    const results: SearchResultItem[] = [
        { id: 1, name: 'Control one', status: 'active' },
        { id: 2, name: 'Control two', status: 'active' },
    ];

    function renderResults(items: SearchResultItem[]) {
        return render(
            <LinkSearchResults
                mode="control-to-risk"
                searchQuery=""
                searchResults={items}
                isSearching={false}
                isLoadingLookups={false}
                selectedTargetId={null}
                onSelectTarget={vi.fn()}
                onUnarchive={vi.fn()}
            />,
        );
    }

    it('counts results with plural forms in English and Czech (GAP-B-14)', async () => {
        const { unmount } = renderResults([results[0]]);
        expect(screen.getByText('1 item')).toBeInTheDocument();
        unmount();
        const second = renderResults(results);
        expect(screen.getByText('2 items')).toBeInTheDocument();
        second.unmount();

        await i18n.changeLanguage('cs');
        const one = renderResults([results[0]]);
        expect(screen.getByText('1 položka')).toBeInTheDocument();
        one.unmount();
        const few = renderResults([...results, { id: 3, name: 'Control three', status: 'active' }]);
        expect(screen.getByText('3 položky')).toBeInTheDocument();
        few.unmount();
        const many = renderResults(Array.from({ length: 5 }, (_, index) => ({ id: index + 10, name: `C${index}`, status: 'active' })));
        expect(screen.getByText('5 položek')).toBeInTheDocument();
        many.unmount();
    });

    it('shows the shared no-results state with guidance when nothing matches', () => {
        renderResults([]);

        expect(screen.getByRole('status')).toHaveAttribute('data-kind', 'no-results');
        expect(screen.getByText('Try adjusting your filters or search query')).toBeInTheDocument();
    });

    it('selects a result through its full-row button and offers a named restore for archived controls', async () => {
        const user = userEvent.setup();
        const onSelectTarget = vi.fn();
        const onUnarchive = vi.fn().mockResolvedValue(undefined);
        render(
            <LinkSearchResults
                mode="control-to-risk"
                searchQuery="control"
                searchResults={[
                    { id: 1, name: 'Control one', status: 'active', description: 'First' },
                    {
                        id: 2,
                        name: 'Archived control',
                        status: 'active',
                        is_archived: true,
                        capabilities: { can_restore: true },
                    },
                ]}
                isSearching={false}
                isLoadingLookups={false}
                selectedTargetId={null}
                onSelectTarget={onSelectTarget}
                onUnarchive={onUnarchive}
            />,
        );

        await user.click(screen.getByText('First'));
        expect(onSelectTarget).toHaveBeenCalledWith(1);
        expect(screen.getByText('Archived')).toHaveAttribute('data-tone', 'neutral');
        await user.click(screen.getByRole('button', { name: 'Unarchive' }));
        expect(onUnarchive).toHaveBeenCalledWith(2);
    });
});

describe('LinkConfirmationPanel', () => {
    it('confirms or changes the selected target through shared buttons', async () => {
        const user = userEvent.setup();
        const onLink = vi.fn();
        const onSelectTarget = vi.fn();
        const { container } = render(
            <LinkConfirmationPanel
                mode="risk-to-control"
                selectedTargetId={5}
                selectedResult={{ id: 5, name: 'Four-eyes check', control_owner_name: 'Alice', department_name: 'Ops' }}
                onSelectTarget={onSelectTarget}
                onLink={onLink}
                isLinking={false}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Change' }));
        expect(onSelectTarget).toHaveBeenCalledWith(null);
        await user.click(screen.getByRole('button', { name: 'Create Link' }));
        expect(onLink).toHaveBeenCalledTimes(1);
        await expectNoAxeViolations(container);
    });

    it('disables the create button with a busy state while linking', () => {
        render(
            <LinkConfirmationPanel
                mode="risk-to-control"
                selectedTargetId={5}
                selectedResult={{ id: 5, name: 'Four-eyes check' }}
                onSelectTarget={vi.fn()}
                onLink={vi.fn()}
                isLinking
            />,
        );

        const create = screen.getByRole('button', { name: 'Create Link' });
        expect(create).toBeDisabled();
        expect(create).toHaveAttribute('aria-busy', 'true');
    });
});
