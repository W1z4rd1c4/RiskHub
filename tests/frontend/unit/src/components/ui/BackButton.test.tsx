import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { BackButton } from '@/components/ui/BackButton';
import { renderWithoutProviders, screen } from '@test/render';

/**
 * Audit 2026-09-30 §4.7 / §4.14 (D14, AX-06): back controls are labelled and
 * their accessible name is the destination they navigate to.
 */

function renderAtDetail(ui: ReactNode) {
    return renderWithoutProviders(
        <MemoryRouter initialEntries={['/risks/42']}>
            <Routes>
                <Route path="/risks/42" element={ui} />
                <Route path="/risks" element={<h1>Risk register</h1>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('BackButton (to)', () => {
    it('renders a link whose visible text and accessible name are the destination label', () => {
        renderAtDetail(<BackButton to="/risks" label="Back to Risks" />);
        const link = screen.getByRole('link', { name: 'Back to Risks' });
        expect(link).toHaveAttribute('href', '/risks');
        expect(link).toHaveTextContent('Back to Risks');
        const icon = link.querySelector('svg');
        expect(icon).toHaveAttribute('aria-hidden', 'true');
        // Styled through the shared Button recipe (secondary by default).
        expect(link.className).toContain('bg-secondary');
    });

    it('navigates to the destination with the keyboard (Enter)', async () => {
        const user = userEvent.setup();
        renderAtDetail(<BackButton to="/risks" label="Back to Risks" />);
        await user.tab();
        expect(screen.getByRole('link', { name: 'Back to Risks' })).toHaveFocus();
        await user.keyboard('{Enter}');
        expect(await screen.findByRole('heading', { name: 'Risk register' })).toBeInTheDocument();
    });

    it('honours variant and size overrides', () => {
        renderAtDetail(<BackButton to="/risks" label="Back to Risks" variant="ghost" size="compact" />);
        const cls = screen.getByRole('link', { name: 'Back to Risks' }).className.split(/\s+/);
        expect(cls).toContain('h-8');
        expect(cls).not.toContain('bg-secondary');
    });
});

describe('BackButton (onClick)', () => {
    it('renders a non-submitting button named by the label', () => {
        renderWithoutProviders(<BackButton onClick={vi.fn()} label="Back to Vendor A" />);
        const button = screen.getByRole('button', { name: 'Back to Vendor A' });
        expect(button).toHaveAttribute('type', 'button');
    });

    it('activates with Enter and Space', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        renderWithoutProviders(<BackButton onClick={onClick} label="Back to Vendor A" />);
        await user.tab();
        expect(screen.getByRole('button', { name: 'Back to Vendor A' })).toHaveFocus();
        await user.keyboard('{Enter}');
        await user.keyboard(' ');
        expect(onClick).toHaveBeenCalledTimes(2);
    });
});
