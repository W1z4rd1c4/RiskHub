import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { HeroPage } from '@/pages/HeroPage';

function renderLanding() {
    return render(
        <MemoryRouter initialEntries={['/landing']}>
            <Routes>
                <Route path="/landing" element={<HeroPage />} />
                <Route path="/" element={<p>Dashboard home</p>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('HeroPage (DS-24, AX-15, D14)', () => {
    it('renders the landing page on the public frame with one h1, the brand and the language switch', () => {
        renderLanding();

        const main = screen.getByRole('main');
        expect(main).toHaveClass('min-h-screen', 'overflow-y-auto', 'bg-background', 'text-foreground');
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.getByRole('heading', { level: 1, name: 'Enterprise Risk Management' })).toHaveFocus();
        expect(within(main).getByText('Hub')).toHaveClass('text-accent-text');
        expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
        expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
            'Real-time Analytics',
            'SII Compliance',
            'Role Based Access',
        ]);
        expect(screen.getByText('Engineered for Solvency II Excellence')).toBeInTheDocument();
    });

    it('opens the platform from the primary action', async () => {
        renderLanding();

        const access = screen.getByRole('button', { name: 'Access Platform' });
        expect(access).toHaveClass('bg-accent');
        await userEvent.setup().click(access);

        expect(await screen.findByText('Dashboard home')).toBeInTheDocument();
    });
});
