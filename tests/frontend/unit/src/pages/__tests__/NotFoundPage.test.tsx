import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { NotFoundPage } from '@/pages/NotFoundPage';

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>;
}

describe('NotFoundPage', () => {
    it('keeps the unknown URL visible and offers only safe Dashboard and Back choices', () => {
        render(
            <MemoryRouter initialEntries={['/unknown/private-looking-path?view=detail#section']}>
                <Routes>
                    <Route
                        path="*"
                        element={(
                            <>
                                <NotFoundPage />
                                <LocationProbe />
                            </>
                        )}
                    />
                </Routes>
            </MemoryRouter>,
        );

        expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/');
        expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent(
            '/unknown/private-looking-path?view=detail#section',
        );
    });
});
