import {
    Link,
    Outlet,
    RouterProvider,
    createMemoryRouter,
    useLocation,
    useNavigate,
} from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IssueNewPage } from '@/pages/IssueNewPage';

const issueApiMocks = vi.hoisted(() => ({
    create: vi.fn(),
    list: vi.fn(),
    listAssignableOwners: vi.fn(),
    listDepartments: vi.fn(),
}));

vi.mock('@/services/issuesApi', () => ({
    issuesApi: issueApiMocks,
}));

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>;
}

function BrowserBackButton() {
    const navigate = useNavigate();
    return <button type="button" onClick={() => void navigate(-1)}>Browser Back</button>;
}

function renderIssueNewPage() {
    const router = createMemoryRouter([
        {
            path: '/',
            element: (
                <>
                    <LocationProbe />
                    <nav aria-label="Register navigation">
                        <Link to="/risks">Risks sidebar</Link>
                    </nav>
                    <BrowserBackButton />
                    <Outlet />
                </>
            ),
            children: [
                { path: 'issues', element: <p>Issues register</p> },
                { path: 'issues/new', element: <IssueNewPage /> },
                { path: 'issues/:issueId', element: <p>Issue detail</p> },
                { path: 'risks', element: <p>Risks register</p> },
            ],
        },
    ], {
        initialEntries: ['/issues', '/issues/new'],
        initialIndex: 1,
    });

    const visitedLocations: string[] = [];
    let previousLocationKey = router.state.location.key;
    router.subscribe((state) => {
        if (state.location.key === previousLocationKey) return;
        previousLocationKey = state.location.key;
        visitedLocations.push(`${state.location.pathname}${state.location.search}`);
    });

    return { router, visitedLocations, ...render(<RouterProvider router={router} />) };
}

async function selectDepartment(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('combobox', { name: 'Select department' }));
    await user.click(await screen.findByRole('option', { name: 'Operations (OPS)' }));
}

describe('IssueNewPage unsaved changes', () => {
    beforeEach(() => {
        issueApiMocks.create.mockReset();
        issueApiMocks.list.mockReset();
        issueApiMocks.listAssignableOwners.mockReset();
        issueApiMocks.listDepartments.mockReset();
        issueApiMocks.list.mockResolvedValue({
            items: [],
            total: 0,
            offset: 0,
            limit: 1,
            capabilities: { can_create: true },
        });
        issueApiMocks.listDepartments.mockResolvedValue([
            { id: 4, name: 'Operations', code: 'OPS' },
        ]);
        issueApiMocks.listAssignableOwners.mockResolvedValue([]);
    });

    it('keeps the route and draft when the user stays, then stops blocking after an exact revert', async () => {
        const user = userEvent.setup();
        const { router } = renderIssueNewPage();
        const title = await screen.findByPlaceholderText('Issue title');

        await user.type(title, 'Investigate failed control');
        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(await screen.findByRole('alertdialog')).toHaveTextContent(
            'You have unsaved changes. Are you sure you want to leave?',
        );
        expect(screen.getByTestId('location')).toHaveTextContent('/issues/new');
        expect(title).toHaveValue('Investigate failed control');

        await user.click(screen.getByRole('button', { name: 'Stay' }));
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(title).toHaveValue('Investigate failed control');

        await user.clear(title);
        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        await waitFor(() => expect(router.state.location.pathname).toBe('/issues'));
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('guards sidebar and browser-back transitions with the same single dialog', async () => {
        const user = userEvent.setup();
        const { router } = renderIssueNewPage();
        const title = await screen.findByPlaceholderText('Issue title');

        await user.type(title, 'Investigate failed control');
        await user.click(screen.getByRole('link', { name: 'Risks sidebar' }));

        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
        await user.click(screen.getByRole('button', { name: 'Stay' }));
        expect(router.state.location.pathname).toBe('/issues/new');
        expect(title).toHaveValue('Investigate failed control');

        await user.click(screen.getByRole('button', { name: 'Browser Back' }));
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Leave' }));

        await waitFor(() => expect(router.state.location.pathname).toBe('/issues'));
    });

    it('uses only the native beforeunload contract for a dirty draft', async () => {
        const user = userEvent.setup();
        renderIssueNewPage();
        const title = await screen.findByPlaceholderText('Issue title');

        await user.type(title, 'Investigate failed control');
        const dirtyUnload = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(dirtyUnload);

        expect(dirtyUnload.defaultPrevented).toBe(true);
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

        await user.clear(title);
        const cleanUnload = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(cleanUnload);
        expect(cleanUnload.defaultPrevented).toBe(false);
    });

    it('keeps a rejected direct save dirty', async () => {
        const user = userEvent.setup();
        issueApiMocks.create.mockRejectedValue(new Error('save unavailable'));
        const { router } = renderIssueNewPage();

        await user.type(await screen.findByPlaceholderText('Issue title'), 'Investigate failed control');
        await selectDepartment(user);
        await user.click(screen.getByRole('button', { name: 'Create Issue' }));
        await waitFor(() => expect(issueApiMocks.create).toHaveBeenCalledTimes(1));
        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        expect(router.state.location.pathname).toBe('/issues/new');
    });

    it('accepts a direct save before navigating exactly once', async () => {
        const user = userEvent.setup();
        issueApiMocks.create.mockResolvedValue({ id: 17 });
        const { router, visitedLocations } = renderIssueNewPage();

        await user.type(await screen.findByPlaceholderText('Issue title'), 'Investigate failed control');
        await selectDepartment(user);
        await user.click(screen.getByRole('button', { name: 'Create Issue' }));

        await waitFor(() => expect(router.state.location.pathname).toBe('/issues/17'));
        expect(issueApiMocks.create).toHaveBeenCalledTimes(1);
        expect(visitedLocations).toEqual(['/issues/17?return_to=%2Fissues']);
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('locks the direct-save draft and cancels user navigation while the request is pending', async () => {
        const user = userEvent.setup();
        let resolveCreate: (value: { id: number }) => void = () => {};
        issueApiMocks.create.mockReturnValue(new Promise((resolve) => {
            resolveCreate = resolve;
        }));
        const { router, visitedLocations } = renderIssueNewPage();
        const title = await screen.findByPlaceholderText('Issue title');

        await user.type(title, 'Investigate failed control');
        await selectDepartment(user);
        await user.click(screen.getByRole('button', { name: 'Create Issue' }));
        await waitFor(() => expect(issueApiMocks.create).toHaveBeenCalledTimes(1));

        expect(title).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

        await user.click(screen.getByRole('link', { name: 'Risks sidebar' }));
        expect(router.state.location.pathname).toBe('/issues/new');
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Browser Back' }));
        expect(router.state.location.pathname).toBe('/issues/new');
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

        await act(async () => resolveCreate({ id: 17 }));
        await waitFor(() => expect(router.state.location.pathname).toBe('/issues/17'));
        expect(visitedLocations).toEqual(['/issues/17?return_to=%2Fissues']);
    });
});
