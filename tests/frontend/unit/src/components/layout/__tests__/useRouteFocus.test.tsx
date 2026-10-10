import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useRef, useState } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { PageHeader } from '@/components/layout/PageHeader';
import { useRouteFocus } from '@/components/layout/useRouteFocus';
import i18n from '@/i18n';

/** Shell harness: the same wiring as `MainLayout` (main ref + polite announcer). */
function Shell() {
    const mainRef = useRef<HTMLElement>(null);
    const announcement = useRouteFocus(mainRef);
    return (
        <>
            <nav>
                <Link to="/alpha">Alpha</Link>
                <Link to="/beta">Beta</Link>
                <Link to="/late">Late</Link>
                <Link to="/swap">Swap</Link>
                <Link to="/alpha?tab=two">Alpha tab two</Link>
                {/* `useApprovalQueued()` writes its notice as router state on the same path. */}
                <Link to="/alpha" replace state={{ approvalQueued: { approvalId: 7 } }}>Alpha queued</Link>
            </nav>
            <p role="status" aria-live="polite" data-testid="announcer">{announcement}</p>
            <main ref={mainRef} tabIndex={-1}>
                <Routes>
                    <Route path="/alpha" element={<PageHeader title="Alpha page" />} />
                    <Route path="/beta" element={<PageHeader title="Beta page" />} />
                    <Route path="/late" element={<LatePage />} />
                    <Route path="/swap" element={<SwapPage />} />
                </Routes>
            </main>
        </>
    );
}

/** Renders its header after a delay, like a lazy route waiting for its first query. */
function LatePage() {
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const timer = window.setTimeout(() => setReady(true), 30);
        return () => window.clearTimeout(timer);
    }, []);
    return (
        <>
            {ready ? <PageHeader title="Late page" /> : <p>Loading…</p>}
            <button type="button">Early action</button>
        </>
    );
}

/** A state-shell `h1` (loading) replaced by the loaded record's own `h1` element. */
function SwapPage() {
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const timer = window.setTimeout(() => setReady(true), 30);
        return () => window.clearTimeout(timer);
    }, []);
    return ready
        ? <section><PageHeader title="Loaded record" /></section>
        : <div><PageHeader title="Register" /><p>Loading…</p></div>;
}

afterEach(async () => {
    await i18n.changeLanguage('en');
    document.title = '';
});

describe('useRouteFocus (NAV-01, D14)', () => {
    it('does not move focus or announce on the first render', () => {
        render(<MemoryRouter initialEntries={['/alpha']}><Shell /></MemoryRouter>);

        expect(screen.getByRole('heading', { level: 1, name: 'Alpha page' })).not.toHaveFocus();
        expect(screen.getByTestId('announcer')).toBeEmptyDOMElement();
    });

    it('focuses the new page h1 and announces the translated document title after a pathname change', async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/alpha']}><Shell /></MemoryRouter>);

        await user.click(screen.getByRole('link', { name: 'Beta' }));

        const heading = await screen.findByRole('heading', { level: 1, name: 'Beta page' });
        await waitFor(() => expect(heading).toHaveFocus());
        await waitFor(() => expect(screen.getByTestId('announcer')).toHaveTextContent('Beta page · RiskHub'));
        expect(document.title).toBe('Beta page · RiskHub');
    });

    it('waits for a heading that renders after the route mounts', async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/alpha']}><Shell /></MemoryRouter>);

        await user.click(screen.getByRole('link', { name: 'Late' }));
        expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();

        const heading = await screen.findByRole('heading', { level: 1, name: 'Late page' });
        await waitFor(() => expect(heading).toHaveFocus());
        await waitFor(() => expect(screen.getByTestId('announcer')).toHaveTextContent('Late page · RiskHub'));
    });

    it('follows a state-shell h1 replaced by the loaded record h1 when the swap dropped focus', async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/alpha']}><Shell /></MemoryRouter>);

        await user.click(screen.getByRole('link', { name: 'Swap' }));
        await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Register' })).toHaveFocus());

        const loaded = await screen.findByRole('heading', { level: 1, name: 'Loaded record' });
        await waitFor(() => expect(loaded).toHaveFocus());
        await waitFor(() => expect(screen.getByTestId('announcer')).toHaveTextContent('Loaded record · RiskHub'));
    });

    it('leaves focus alone on a search-param change within the same page', async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/alpha']}><Shell /></MemoryRouter>);

        const link = screen.getByRole('link', { name: 'Alpha tab two' });
        await user.click(link);
        await act(async () => {
            await new Promise((resolve) => window.setTimeout(resolve, 80));
        });

        expect(screen.getByRole('heading', { level: 1, name: 'Alpha page' })).not.toHaveFocus();
        expect(screen.getByTestId('announcer')).toBeEmptyDOMElement();
    });

    it('leaves focus alone on a router-state change on the same page (approval-queued notice)', async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/alpha']}><Shell /></MemoryRouter>);

        const link = screen.getByRole('link', { name: 'Alpha queued' });
        await user.click(link);
        await act(async () => {
            await new Promise((resolve) => window.setTimeout(resolve, 80));
        });

        expect(link).toHaveFocus();
        expect(screen.getByTestId('announcer')).toBeEmptyDOMElement();
    });

    it('does not steal focus the user already moved into the page while it loaded', async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/alpha']}><Shell /></MemoryRouter>);

        await user.click(screen.getByRole('link', { name: 'Late' }));
        const early = screen.getByRole('button', { name: 'Early action' });
        early.focus();

        const heading = await screen.findByRole('heading', { level: 1, name: 'Late page' });
        await waitFor(() => expect(screen.getByTestId('announcer')).toHaveTextContent('Late page · RiskHub'));
        expect(heading).not.toHaveFocus();
    });
});
