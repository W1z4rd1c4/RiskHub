import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AdminConsolePage } from '@/pages/AdminConsolePage';
import { RiskHubPage } from '@/pages/RiskHubPage';
import { SettingsPage } from '@/pages/SettingsPage';

vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({ isLoading: false, user: { id: 7, name: 'Route Tester' } }),
}));

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({ canViewAdminConsole: true, canViewRiskHub: true }),
}));

vi.mock('@/components/settings', () => ({
    AppearanceSettings: () => <div>Appearance content</div>,
    DocumentationSettings: () => <div>Documentation content</div>,
    LocalizationSettings: () => <div>Localization content</div>,
    NotificationSettings: () => <div>Notification settings content</div>,
    ProfileSettings: () => <div>Profile content</div>,
}));

vi.mock('@/components/riskhub', () => ({
    ApprovalScenariosPanel: () => <div>Approval scenarios content</div>,
    DepartmentsPanel: () => <div>Departments content</div>,
    RiskQuestionnairesPanel: () => <div>Questionnaires content</div>,
    RiskTypesPanel: () => <div>Risk types content</div>,
    RolesPanel: () => <div>Roles content</div>,
    SystemSettingsPanel: () => <div>System settings content</div>,
}));

vi.mock('@/pages/admin-console/sections/AdminConsoleAuditPanels', () => ({
    AuditLogsPanel: () => <div>Audit content</div>,
}));

vi.mock('@/pages/admin-console/sections/AdminConsoleOpsPanels', () => ({
    HealthPanel: () => <div>Health content</div>,
    LogsPanel: () => <div>Logs content</div>,
    SessionsPanel: () => <div>Sessions content</div>,
}));

function RouterState() {
    const location = useLocation();
    const navigate = useNavigate();
    return (
        <>
            <output data-testid="location">{location.pathname}{location.search}</output>
            <button type="button" onClick={() => navigate(-1)}>History back</button>
        </>
    );
}

function renderPage(page: React.ReactNode, entry: string) {
    return render(
        <MemoryRouter initialEntries={[entry]}>
            {page}
            <RouterState />
        </MemoryRouter>,
    );
}

describe('secondary content-tab routes', () => {
    it('restores Settings choices through URL history and preserves return context', async () => {
        const user = userEvent.setup();
        renderPage(<SettingsPage />, '/settings?tab=appearance&return_to=%2Frisks%3Fpage%3D4');

        const tablist = screen.getByRole('tablist', { name: 'Platform Settings' });
        expect(within(tablist).getByRole('tab', { name: 'Appearance' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('Appearance content')).toBeInTheDocument();

        await user.click(within(tablist).getByRole('tab', { name: 'Help & Docs' }));
        expect(screen.getByTestId('location')).toHaveTextContent(
            '/settings?tab=documentation&return_to=%2Frisks%3Fpage%3D4',
        );
        await user.click(screen.getByRole('button', { name: 'History back' }));
        expect(screen.getByText('Appearance content')).toBeInTheDocument();
    });

    it('omits the Risk Hub default while preserving unrelated params', async () => {
        const user = userEvent.setup();
        renderPage(<RiskHubPage />, '/riskhub?tab=questionnaires&source=audit');

        const tablist = screen.getByRole('tablist', { name: 'Risk Hub' });
        expect(screen.getByText('Questionnaires content')).toBeInTheDocument();
        await user.click(within(tablist).getByRole('tab', { name: 'Risk Types' }));
        expect(screen.getByTestId('location')).toHaveTextContent('/riskhub?source=audit');
    });

    it('loads an Admin Console tab from a shared URL', () => {
        renderPage(<AdminConsolePage />, '/admin?tab=sessions&keep=1');

        const tablist = screen.getByRole('tablist', { name: 'Admin Console' });
        expect(within(tablist).getByRole('tab', { name: 'Active Sessions' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('Sessions content')).toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('/admin?tab=sessions&keep=1');
    });
});
