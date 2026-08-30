import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@test/queryClient';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';

// FR-P4-3/4 (#64): the ICT Committee is a URL-addressable dashboard tab at
// /?view=ict-committee, sibling to the Risk Committee tab. These specs pin the
// acceptance criteria (a)-(d): authorized deep-link resolves; unauthorized /
// invalid view normalizes to overview without mounting (hence fetching) the
// committee section; browser back/forward moves between tabs; and the ICT tab
// is independent of the overview request (never blocked by its loading/error).

const fetchOverviewMock = vi.fn();
let canViewCommitteeMock = false;
let canViewIctCommitteeMock = false;

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({
        canViewCommittee: canViewCommitteeMock,
        can: (action: string, resource: string) =>
            action === 'read' && resource === 'ict_committee' ? canViewIctCommitteeMock : false,
    }),
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/services/dashboardApi', () => ({
    dashboardApi: {
        fetchOverview: (...args: unknown[]) => fetchOverviewMock(...args),
    },
}));

// Stand-ins: the real sections own their own data fetches, so asserting on the
// presence/absence of these markers is equivalent to asserting whether the
// committee data would be fetched.
vi.mock('@/pages/dashboard/DashboardOverviewContent', () => ({
    DashboardOverviewContent: () => <div>overview content</div>,
}));
vi.mock('@/components/dashboard/RiskCommitteeSection', () => ({
    RiskCommitteeSection: () => <div>risk committee section</div>,
}));
vi.mock('@/components/dashboard/IctCommitteeSection', () => ({
    IctCommitteeSection: () => <div>ict committee section</div>,
}));

import { DashboardPage } from '@/pages/DashboardPage';

function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function BackButton() {
    const navigate = useNavigate();
    return (
        <button type="button" onClick={() => navigate(-1)}>
            __back__
        </button>
    );
}

function renderDashboard(initialEntries: string[] = ['/']) {
    const queryClient = createTestQueryClient();
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={initialEntries}>
                <DashboardFilterProvider>
                    <DashboardPage />
                    <LocationProbe />
                    <BackButton />
                </DashboardFilterProvider>
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

const MINIMAL_OVERVIEW = {
    summary: {
        total_controls: 0,
        controls_by_status: {},
        controls_by_form: {},
        controls_by_frequency: {},
        total_risks: 0,
        risks_by_status: {},
        critical_risks_count: 0,
        average_net_risk_score: 0,
    },
    department_metrics: [],
    gross_distribution: { distribution: [] },
    net_distribution: { distribution: [] },
    control_trends: [],
    risk_trends: [],
    kri_breach_trends: [],
    issue_summary: null,
    issue_aging: null,
    issue_severity: null,
    generated_at: '2026-07-12T10:00:00Z',
    capabilities: {
        can_read: true,
        can_view_issue_metrics: false,
        can_view_committee: false,
        can_view_vendor_metrics: false,
        can_use_department_filter: false,
        can_export_or_report: false,
    },
};

beforeEach(() => {
    vi.clearAllMocks();
    canViewCommitteeMock = false;
    canViewIctCommitteeMock = false;
    fetchOverviewMock.mockResolvedValue(MINIMAL_OVERVIEW);
});

describe('DashboardPage — ICT Committee tab addressability (#64)', () => {
    it('(a) resolves an authorized ?view=ict-committee deep-link to the ICT tab', async () => {
        canViewIctCommitteeMock = true;

        renderDashboard(['/?view=ict-committee']);

        expect(await screen.findByText('ict committee section')).toBeInTheDocument();
        expect(screen.queryByText('overview content')).not.toBeInTheDocument();
        expect(screen.queryByText('risk committee section')).not.toBeInTheDocument();
        // The address stays on the committee tab (not stripped).
        expect(screen.getByTestId('location')).toHaveTextContent('/?view=ict-committee');
    });

    it('(a) resolves an authorized ?view=risk-committee deep-link to the Risk tab', async () => {
        canViewCommitteeMock = true;

        renderDashboard(['/?view=risk-committee']);

        expect(await screen.findByText('risk committee section')).toBeInTheDocument();
        expect(screen.queryByText('overview content')).not.toBeInTheDocument();
    });

    it('(b) normalizes an UNAUTHORIZED ?view=ict-committee to overview without mounting the ICT section', async () => {
        canViewIctCommitteeMock = false;

        renderDashboard(['/?view=ict-committee']);

        expect(await screen.findByText('overview content')).toBeInTheDocument();
        // The ICT section (which owns the committee fetch) is never mounted.
        expect(screen.queryByText('ict committee section')).not.toBeInTheDocument();
        // The stray view param is stripped so the address matches the overview tab.
        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/'));
        expect(screen.getByTestId('location')).not.toHaveTextContent('view=');
    });

    it('(b) normalizes an INVALID ?view=bogus to overview', async () => {
        canViewCommitteeMock = true;
        canViewIctCommitteeMock = true;

        renderDashboard(['/?view=bogus']);

        expect(await screen.findByText('overview content')).toBeInTheDocument();
        expect(screen.queryByText('ict committee section')).not.toBeInTheDocument();
        expect(screen.queryByText('risk committee section')).not.toBeInTheDocument();
        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/'));
    });

    it('(c) browser back/forward updates the selected tab', async () => {
        canViewCommitteeMock = true;
        canViewIctCommitteeMock = true;

        renderDashboard(['/']);

        expect(await screen.findByText('overview content')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /views\.ict_committee/ }));
        expect(await screen.findByText('ict committee section')).toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('/?view=ict-committee');

        fireEvent.click(screen.getByRole('button', { name: /views\.risk_committee/ }));
        expect(await screen.findByText('risk committee section')).toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('/?view=risk-committee');

        // Back → ICT tab, back again → overview: the tab tracks history.
        fireEvent.click(screen.getByRole('button', { name: '__back__' }));
        expect(await screen.findByText('ict committee section')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '__back__' }));
        expect(await screen.findByText('overview content')).toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('/');
    });

    it('(d) renders the ICT tab independently of the overview request (never fetched, no overview loading/error)', async () => {
        canViewIctCommitteeMock = true;
        // Even if the overview endpoint were to hang or fail, the ICT tab must show.
        fetchOverviewMock.mockRejectedValue(new Error('overview down'));

        renderDashboard(['/?view=ict-committee']);

        expect(await screen.findByText('ict committee section')).toBeInTheDocument();
        // The overview request is not issued for the ICT tab, so its loading/error
        // states can never replace the committee (fixes the former early-return).
        expect(fetchOverviewMock).not.toHaveBeenCalled();
        expect(screen.queryByText('loading')).not.toBeInTheDocument();
        expect(screen.queryByText('errors.connection_interrupted')).not.toBeInTheDocument();
    });

    it('(d) still gates the OVERVIEW tab on its own loading state', async () => {
        // A pending overview request keeps the overview tab in its loading branch;
        // the committee-independence change must not remove that gate.
        fetchOverviewMock.mockReturnValue(new Promise(() => {}));

        renderDashboard(['/']);

        expect(await screen.findByText('loading')).toBeInTheDocument();
        expect(screen.queryByText('overview content')).not.toBeInTheDocument();
    });

    it('hides both committee tabs when the user is authorized for neither', async () => {
        renderDashboard(['/']);

        expect(await screen.findByText('overview content')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /views\.risk_committee/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /views\.ict_committee/ })).not.toBeInTheDocument();
    });
});
