import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from '@/components/tables/Pagination';

const translations: Record<string, string> = {
    'pagination.showing': 'Showing',
    'pagination.to': 'to',
    'pagination.of': 'of',
    'pagination.page': 'Page',
    'labels.results': 'results',
    'labels.no_results': 'No results found',
};

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => translations[key] ?? key,
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
});
