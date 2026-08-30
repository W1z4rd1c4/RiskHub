import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { AppearanceSettings } from '@/components/settings/AppearanceSettings';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AdminConsolePage } from '@/pages/AdminConsolePage';
import ApprovalsPage from '@/pages/ApprovalsPage';
import { clearBootstrapSession } from '@/services/session/coordinator';
import { clearAccessToken, setAccessToken } from '@test/accessTokenStoreHarness';
import { AuthProviderWithReady, waitForAuthBootstrapReady } from '@test/authBootstrap';
import { server } from '@test/mocks/server';
import { createTestQueryClient } from '@test/queryClient';

function renderApprovalsPage() {
    const queryClient = createTestQueryClient();

    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/approvals']}>
                <ApprovalsPage />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

async function renderAdminConsolePage() {
    const queryClient = createTestQueryClient();

    render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/admin']}>
                <AuthProviderWithReady>
                    <AdminConsolePage />
                </AuthProviderWithReady>
            </MemoryRouter>
        </QueryClientProvider>,
    );

    await waitForAuthBootstrapReady();
}

function installAdminHandlers() {
    server.use(
        http.get('*/api/v1/admin/health', () => HttpResponse.json({
            database_status: 'connected',
            database_latency_ms: 1,
            uptime_seconds: 3600,
            memory_usage_mb: 128,
            last_check: '2026-08-29T10:00:00Z',
        })),
        http.get('*/api/v1/admin/stats', () => HttpResponse.json({
            total_users: 1,
            active_users_24h: 1,
            total_risks: 0,
            total_controls: 0,
            total_kris: 0,
            pending_approvals: 0,
        })),
        http.get('*/api/v1/admin/jobs/status', () => HttpResponse.json({
            process_role: 'web',
            instance_id: 'test',
            process_started_at: '2026-08-29T10:00:00Z',
            scheduler_enabled: true,
            scheduler_running: true,
            lock_provider: null,
            lock_acquired: false,
            current_owner_instance_id: null,
            latest_runs: [],
            running_jobs: [],
        })),
        http.get('*/api/v1/admin/outbox/status', () => HttpResponse.json({
            pending_count: 0,
            processing_count: 0,
            dead_letter_count: 0,
            oldest_pending_age_seconds: null,
            last_dispatch_started_at: null,
            last_dispatch_finished_at: null,
            last_dispatch_status: null,
            last_dispatch_processed: null,
            last_dispatch_error: null,
            recent_failures: [],
        })),
        http.get('*/api/v1/admin/logs', () => HttpResponse.json([])),
        http.get('*/api/v1/admin/sessions', () => HttpResponse.json([])),
        http.get('*/api/v1/admin/capabilities', () => HttpResponse.json({
            can_revoke_sessions: true,
            can_run_directory_check_all: true,
            can_update_log_config: true,
            can_export_loaded_audit_logs: true,
        })),
    );
}

function expectTabRelationship(tab: HTMLElement, panel: HTMLElement, prefix: string, value: string) {
    expect(tab).toHaveAttribute('id', `${prefix}-tab-${value}`);
    expect(tab).toHaveAttribute('aria-controls', `${prefix}-panel-${value}`);
    expect(panel).toHaveAttribute('id', `${prefix}-panel-${value}`);
    expect(panel).toHaveAttribute('aria-labelledby', `${prefix}-tab-${value}`);
}

function expectMountedTabPanels(tabs: HTMLElement[]) {
    const panels = tabs.map((tab) => {
        const panelId = tab.getAttribute('aria-controls');
        expect(panelId).not.toBeNull();

        const panel = document.getElementById(panelId!);
        expect(panel).not.toBeNull();
        expect(panel).toHaveAttribute('role', 'tabpanel');
        return panel!;
    });

    const activePanels = panels.filter((panel) => !panel.hidden);
    expect(activePanels).toHaveLength(1);
    expect(activePanels[0]).toHaveAttribute('tabindex', '0');

    for (const panel of panels.filter((candidate) => candidate !== activePanels[0])) {
        expect(panel).toHaveAttribute('hidden');
        expect(panel).toHaveAttribute('tabindex', '-1');
        expect(panel).toBeEmptyDOMElement();
    }
}

describe('UX-157 desktop content tabs', () => {
    beforeEach(() => {
        clearBootstrapSession();
        setAccessToken('ux-157-admin-token');
        installAdminHandlers();
    });

    afterEach(() => {
        clearAccessToken();
        clearBootstrapSession();
    });

    it('gives Approvals one automatically activating, wrapping roving tab stop', async () => {
        const user = userEvent.setup();
        renderApprovalsPage();

        const tablist = screen.getByRole('tablist', { name: 'Approvals' });
        const tabs = within(tablist).getAllByRole('tab');
        const pending = within(tablist).getByRole('tab', { name: 'Pending Queue' });
        const history = within(tablist).getByRole('tab', { name: 'History' });
        const pendingPanel = screen.getByRole('tabpanel', { name: 'Pending Queue' });

        expect(tabs).toHaveLength(4);
        expect(tabs.filter((tab) => tab.tabIndex === 0)).toEqual([pending]);
        expect(pending).toHaveAttribute('aria-selected', 'true');
        expectTabRelationship(pending, pendingPanel, 'workflow', 'pending');
        expectMountedTabPanels(tabs);

        pending.focus();
        await user.keyboard('{ArrowLeft}');
        expect(history).toHaveFocus();
        expect(history).toHaveAttribute('aria-selected', 'true');

        await user.keyboard('{Home}');
        expect(pending).toHaveFocus();
        await user.keyboard('{ArrowRight}');
        expect(within(tablist).getByRole('tab', { name: 'My Requests' })).toHaveFocus();
        await user.keyboard('{Home}');
        await user.keyboard('{End}');
        expect(history).toHaveFocus();
        expect(tabs.filter((tab) => tab.tabIndex === 0)).toEqual([history]);
        expect(tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true')).toEqual([history]);
        expectMountedTabPanels(tabs);

        const historyPanel = screen.getByRole('tabpanel', { name: 'History' });
        expectTabRelationship(history, historyPanel, 'workflow', 'all');
        await user.tab();
        expect(historyPanel).toHaveFocus();
    });

    it('gives Admin Console one automatically activating, wrapping roving tab stop', async () => {
        const user = userEvent.setup();
        await renderAdminConsolePage();

        const tablist = await screen.findByRole('tablist', { name: 'Admin Console' });
        const tabs = within(tablist).getAllByRole('tab');
        const health = within(tablist).getByRole('tab', { name: 'System Health' });
        const sessions = within(tablist).getByRole('tab', { name: 'Active Sessions' });
        const healthPanel = screen.getByRole('tabpanel', { name: 'System Health' });

        expect(tabs).toHaveLength(4);
        expect(tabs.filter((tab) => tab.tabIndex === 0)).toEqual([health]);
        expectTabRelationship(health, healthPanel, 'admin-console', 'health');
        expectMountedTabPanels(tabs);

        health.focus();
        await user.keyboard('{ArrowLeft}');
        expect(sessions).toHaveFocus();
        expect(sessions).toHaveAttribute('aria-selected', 'true');
        await user.keyboard('{Home}');
        expect(health).toHaveFocus();
        await user.keyboard('{ArrowRight}');
        expect(within(tablist).getByRole('tab', { name: 'Application Logs' })).toHaveFocus();
        await user.keyboard('{Home}');
        await user.keyboard('{End}');
        expect(sessions).toHaveFocus();
        expect(tabs.filter((tab) => tab.tabIndex === 0)).toEqual([sessions]);
        expect(tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true')).toEqual([sessions]);
        expectMountedTabPanels(tabs);

        const sessionsPanel = screen.getByRole('tabpanel', { name: 'Active Sessions' });
        expectTabRelationship(sessions, sessionsPanel, 'admin-console', 'sessions');
        await user.tab();
        expect(sessionsPanel).toHaveFocus();
    });
});

describe('UX-157 Appearance theme choice', () => {
    beforeEach(() => {
        localStorage.setItem('riskhub-theme', 'riskhub');
    });

    it('uses one native radio group for pointer and Arrow selection', async () => {
        const user = userEvent.setup();
        render(
            <AuthProvider>
                <ThemeProvider>
                    <AppearanceSettings />
                </ThemeProvider>
            </AuthProvider>,
        );

        const group = screen.getByRole('group', { name: 'Theme' });
        const radios = within(group).getAllByRole('radio');
        const light = within(group).getByRole('radio', { name: 'Light' });
        const dark = within(group).getByRole('radio', { name: 'Dark' });
        const riskhub = within(group).getByRole('radio', { name: 'RiskHub Theme' });

        expect(radios).toHaveLength(3);
        expect(radios.map((radio) => radio.getAttribute('name'))).toEqual([
            'appearance-theme',
            'appearance-theme',
            'appearance-theme',
        ]);
        expect(riskhub).toBeChecked();

        await user.click(screen.getByTestId('theme-light'));
        expect(light).toBeChecked();
        expect(light).toHaveFocus();
        expect(document.documentElement).toHaveClass('theme-light');

        await user.keyboard('{ArrowRight}');
        expect(dark).toBeChecked();
        expect(dark).toHaveFocus();
        expect(document.documentElement).toHaveClass('theme-dark');
    });
});
