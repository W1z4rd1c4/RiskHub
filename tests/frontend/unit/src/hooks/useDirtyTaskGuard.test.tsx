import { useState } from 'react';
import { RouterProvider, createMemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { useDirtyTaskGuard } from '@/hooks/useDirtyTaskGuard';

function LocalLeaveHarness() {
    const [draft, setDraft] = useState('');
    const [closeCount, setCloseCount] = useState(0);
    const { confirmationDialog, requestLocalLeave } = useDirtyTaskGuard({ currentSnapshot: draft });

    if (closeCount > 0) {
        return <p>Closed {closeCount}</p>;
    }

    return (
        <>
            <label htmlFor="local-draft">Draft</label>
            <input id="local-draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
            <button
                type="button"
                onClick={() => requestLocalLeave(() => setCloseCount((current) => current + 1))}
            >
                Close local task
            </button>
            {confirmationDialog}
        </>
    );
}

function ExplicitAcceptanceHarness() {
    const [draft, setDraft] = useState('original');
    const [closed, setClosed] = useState(false);
    const {
        acceptCurrentSnapshot,
        confirmationDialog,
        requestLocalLeave,
    } = useDirtyTaskGuard({ currentSnapshot: draft });

    if (closed) {
        return <p>Explicitly accepted task closed</p>;
    }

    return (
        <>
            <p>{draft}</p>
            <button
                type="button"
                onClick={() => {
                    acceptCurrentSnapshot('normalized');
                    setDraft('normalized');
                }}
            >
                Accept normalized snapshot
            </button>
            <button type="button" onClick={() => requestLocalLeave(() => setClosed(true))}>
                Close accepted task
            </button>
            {confirmationDialog}
        </>
    );
}

function LocalNavigateHarness() {
    const [draft, setDraft] = useState('');
    const navigate = useNavigate();
    const { confirmationDialog, requestLocalLeave } = useDirtyTaskGuard({ currentSnapshot: draft });

    return (
        <>
            <label htmlFor="navigate-draft">Draft for navigation</label>
            <input
                id="navigate-draft"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
            />
            <button type="button" onClick={() => requestLocalLeave(() => navigate('/done'))}>
                Close and navigate
            </button>
            {confirmationDialog}
        </>
    );
}

function BusyTaskHarness() {
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [localCloseCount, setLocalCloseCount] = useState(0);
    const location = useLocation();
    const navigate = useNavigate();
    const {
        acceptCurrentSnapshot,
        confirmationDialog,
        requestLocalLeave,
    } = useDirtyTaskGuard({ currentSnapshot: draft, busy });

    return (
        <>
            <p data-testid="busy-location">{location.pathname}</p>
            <output data-testid="local-close-count">{localCloseCount}</output>
            <label htmlFor="busy-draft">Busy task draft</label>
            <input
                id="busy-draft"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
            />
            <button type="button" onClick={() => setBusy(true)}>Start request</button>
            <button type="button" onClick={() => acceptCurrentSnapshot(draft)}>
                Accept without navigating
            </button>
            <button
                type="button"
                onClick={() => {
                    acceptCurrentSnapshot(draft);
                    void navigate('/success');
                    setBusy(false);
                }}
            >
                Resolve request
            </button>
            <button type="button" onClick={() => setBusy(false)}>Fail request</button>
            <button type="button" onClick={() => void navigate('/sidebar')}>Sidebar destination</button>
            <button type="button" onClick={() => void navigate(-1)}>Browser back</button>
            <button
                type="button"
                onClick={() => requestLocalLeave(() => setLocalCloseCount((count) => count + 1))}
            >
                Close outer task
            </button>
            {confirmationDialog}
        </>
    );
}

function renderBusyTaskHarness() {
    const router = createMemoryRouter(
        [{ path: '*', element: <BusyTaskHarness /> }],
        { initialEntries: ['/previous', '/task'], initialIndex: 1 },
    );
    render(<RouterProvider router={router} />);
    return router;
}

describe('useDirtyTaskGuard local leave adapter', () => {
    it('keeps a dirty local task on Stay and invokes its leave callback once on Leave', async () => {
        const user = userEvent.setup();
        const router = createMemoryRouter([{ path: '/', element: <LocalLeaveHarness /> }]);
        render(<RouterProvider router={router} />);

        const draft = screen.getByRole('textbox', { name: 'Draft' });
        await user.type(draft, 'Unsaved modal work');
        await user.click(screen.getByRole('button', { name: 'Close local task' }));

        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Stay' }));
        expect(draft).toHaveValue('Unsaved modal work');

        await user.click(screen.getByRole('button', { name: 'Close local task' }));
        await user.click(await screen.findByRole('button', { name: 'Leave' }));

        expect(await screen.findByText('Closed 1')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('can accept an explicit normalized snapshot before the render that applies it', async () => {
        const user = userEvent.setup();
        const router = createMemoryRouter([{ path: '/', element: <ExplicitAcceptanceHarness /> }]);
        render(<RouterProvider router={router} />);

        await user.click(screen.getByRole('button', { name: 'Accept normalized snapshot' }));
        await user.click(screen.getByRole('button', { name: 'Close accepted task' }));

        expect(await screen.findByText('Explicitly accepted task closed')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('uses one confirmation to discard a dirty local task and complete its router navigation', async () => {
        const user = userEvent.setup();
        const router = createMemoryRouter([
            { path: '/', element: <LocalNavigateHarness /> },
            { path: '/done', element: <p>Navigation completed</p> },
        ]);
        render(<RouterProvider router={router} />);

        await user.type(screen.getByRole('textbox', { name: 'Draft for navigation' }), 'Unsaved work');
        await user.click(screen.getByRole('button', { name: 'Close and navigate' }));

        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
        await user.click(screen.getByRole('button', { name: 'Leave' }));

        expect(await screen.findByText('Navigation completed')).toBeInTheDocument();
        expect(router.state.location.pathname).toBe('/done');
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
});

describe('useDirtyTaskGuard pending navigation lock', () => {
    it('cancels user router exits while busy and allows exactly one accepted success navigation', async () => {
        const user = userEvent.setup();
        const router = renderBusyTaskHarness();

        await user.type(screen.getByRole('textbox', { name: 'Busy task draft' }), 'Submitted draft');
        await user.click(screen.getByRole('button', { name: 'Start request' }));
        await user.click(screen.getByRole('button', { name: 'Sidebar destination' }));
        expect(router.state.location.pathname).toBe('/task');
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Browser back' }));
        expect(router.state.location.pathname).toBe('/task');
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Accept without navigating' }));
        await user.click(screen.getByRole('button', { name: 'Sidebar destination' }));
        expect(router.state.location.pathname).toBe('/task');
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Resolve request' }));
        expect(router.state.location.pathname).toBe('/success');
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

        await user.type(screen.getByRole('textbox', { name: 'Busy task draft' }), ' changed again');
        await user.click(screen.getByRole('button', { name: 'Sidebar destination' }));
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        expect(router.state.location.pathname).toBe('/success');
    });

    it('keeps a failed request dirty after busy clears', async () => {
        const user = userEvent.setup();
        const router = renderBusyTaskHarness();

        await user.type(screen.getByRole('textbox', { name: 'Busy task draft' }), 'Failed draft');
        await user.click(screen.getByRole('button', { name: 'Start request' }));
        await user.click(screen.getByRole('button', { name: 'Sidebar destination' }));
        expect(router.state.location.pathname).toBe('/task');
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Fail request' }));
        await user.click(screen.getByRole('button', { name: 'Sidebar destination' }));
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        expect(router.state.location.pathname).toBe('/task');
    });

    it('ignores local leave and prevents native unload while busy', async () => {
        const user = userEvent.setup();
        renderBusyTaskHarness();

        await user.click(screen.getByRole('button', { name: 'Start request' }));
        await user.click(screen.getByRole('button', { name: 'Close outer task' }));
        expect(screen.getByTestId('local-close-count')).toHaveTextContent('0');
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

        const beforeUnload = new Event('beforeunload', { cancelable: true });
        expect(window.dispatchEvent(beforeUnload)).toBe(false);
        expect(beforeUnload.defaultPrevented).toBe(true);
    });
});
