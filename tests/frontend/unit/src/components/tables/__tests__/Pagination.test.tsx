import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from '@/components/tables/Pagination';

const translations: Record<string, string> = {
    'pagination.showing': 'Showing',
    'pagination.to': 'to',
    'pagination.of': 'of',
    'pagination.page': 'Page',
    'labels.results': 'results',
    'labels.no_results': 'No results found',
    'pagination.label': 'Pagination',
    'pagination.go_to_page': 'Go to page',
    'actions.previous': 'Previous',
    'actions.next': 'Next',
};

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => translations[key] ?? key,
        i18n: { language: 'en' },
    }),
}));

describe('Pagination', () => {
    it('shows localized no-results message when total items are zero', () => {
        render(
            <Pagination
                currentPage={1}
                totalPages={1}
                totalItems={0}
                itemsPerPage={10}
                onPageChange={vi.fn()}
            />
        );

        expect(screen.getByText('No results found')).toBeInTheDocument();
        expect(screen.queryByText('Showing')).not.toBeInTheDocument();
    });

    it('shows range summary when items exist', () => {
        const { container } = render(
            <Pagination
                currentPage={2}
                totalPages={3}
                totalItems={25}
                itemsPerPage={10}
                onPageChange={vi.fn()}
            />
        );

        expect(container).toHaveTextContent('Showing 11 to 20 of 25 results');
    });

    it('renders non-submitting buttons with theme text tokens only (DS-01, DS-03)', () => {
        const { container } = render(
            <form>
                <Pagination
                    currentPage={1}
                    totalPages={3}
                    totalItems={25}
                    itemsPerPage={10}
                    onPageChange={vi.fn()}
                />
            </form>
        );

        const buttons = screen.getAllByRole('button');
        expect(buttons).toHaveLength(5);
        buttons.forEach((button) => expect(button).toHaveAttribute('type', 'button'));
        expect(container.innerHTML).not.toMatch(/\btext-(white|slate-\d+)\b/);
    });

    it('renders a named nav with the current page marked and tokenised buttons', async () => {
        const onPageChange = vi.fn();
        const user = userEvent.setup();
        render(
            <Pagination currentPage={2} totalPages={3} totalItems={25} itemsPerPage={10} onPageChange={onPageChange} />
        );

        const nav = screen.getByRole('navigation', { name: 'Pagination' });
        const pageButtons = screen.getAllByRole('button', { name: 'Go to page' });
        expect(pageButtons.map((button) => button.textContent)).toEqual(['1', '2', '3']);
        expect(pageButtons[1]).toHaveAttribute('aria-current', 'page');
        expect(pageButtons[1]).toHaveClass('bg-accent');
        expect(pageButtons[0]).not.toHaveAttribute('aria-current');
        expect(nav.innerHTML).not.toMatch(/\b(?:bg|hover:bg)-white\//);

        await user.click(screen.getByRole('button', { name: 'Next' }));
        await user.click(screen.getByRole('button', { name: 'Previous' }));
        await user.click(pageButtons[2]);
        expect(onPageChange.mock.calls.map(([page]) => page)).toEqual([3, 1, 3]);
    });

    it('compact mode keeps the summary and previous/next only', () => {
        render(
            <Pagination mode="compact" currentPage={1} totalPages={4} itemsPerPage={10} onPageChange={vi.fn()} />
        );

        expect(screen.getByRole('navigation')).toHaveTextContent('Page 1 of 4');
        expect(screen.getAllByRole('button')).toHaveLength(2);
        expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    });

    it('cursor mode drives previous/next from cursor flags', async () => {
        const onPrevious = vi.fn();
        const onNext = vi.fn();
        const user = userEvent.setup();
        const { rerender } = render(
            <Pagination mode="cursor" hasPrevious={false} hasNext onPrevious={onPrevious} onNext={onNext} summary="20 shown" ariaLabel="History pages" />
        );

        expect(screen.getByRole('navigation', { name: 'History pages' })).toHaveTextContent('20 shown');
        expect(screen.queryByRole('button', { name: 'Go to page' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Next' }));
        expect(onNext).toHaveBeenCalledTimes(1);

        rerender(
            <Pagination mode="cursor" hasPrevious hasNext onPrevious={onPrevious} onNext={onNext} isLoading />
        );
        expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
        expect(onPrevious).not.toHaveBeenCalled();
    });
});
