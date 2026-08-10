import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import * as axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Threat } from '@/types/threat';

const mocks = vi.hoisted(() => ({
    canEdit: true,
    canViewGovernance: true,
    cancelApproval: vi.fn(),
    fetchThreat: vi.fn(),
    threat: null as Threat | null,
}));

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({ canViewGovernance: mocks.canViewGovernance }),
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/pages/threats/useThreatDetailState', () => ({
    useThreatDetailState: () => ({
        canArchive: true,
        canEdit: mocks.canEdit,
        canRestore: false,
        error: null,
        fetchThreat: mocks.fetchThreat,
        isAccessDenied: false,
        isLoading: false,
        restoreThreat: vi.fn(),
        setThreat: vi.fn(),
        threat: mocks.threat,
    }),
}));

vi.mock('@/services/approvalsApi', () => ({
    approvalsApi: {
        cancel: (...args: unknown[]) => mocks.cancelApproval(...args),
    },
}));

vi.mock('@/pages/threats/ThreatForm', () => ({
    ThreatForm: ({ initialData }: { initialData?: Threat }) => (
        <div
            data-testid="threat-form"
            data-steward-id={initialData?.threat_steward_user_id ?? ''}
        >
            Threat form
        </div>
    ),
}));

vi.mock('@/pages/threats/ThreatRiskLinksSection', () => ({
    ThreatRiskLinksSection: () => <div data-testid="threat-risk-links-section" />,
}));

vi.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));

import { ThreatDetailPage } from '@/pages/ThreatDetailPage';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

function orphanedThreat(): Threat {
    return {
        id: 73,
        name: 'Orphaned ransomware scenario',
        threat_steward_user_id: 10,
        threat_steward: {
            name: 'Former CISO',
            email: 'former-ciso@example.com',
            role_name: 'ciso',
        },
        steward_orphaned: true,
        stewardship_status: 'pending_governance',
        is_archived: false,
        capabilities: {
            can_read: true,
            can_update: true,
            can_archive: true,
            can_restore: false,
        },
        created_at: '2026-07-15T10:00:00Z',
        updated_at: '2026-07-15T10:00:00Z',
    };
}

function governedPendingThreat(): Threat {
    return {
        ...orphanedThreat(),
        steward_orphaned: false,
        stewardship_status: 'assigned',
        capabilities: {
            can_read: true,
            can_update: false,
            can_archive: false,
            can_restore: false,
            has_pending_change: true,
            business_edit_blocked: true,
            can_cancel_pending_change: true,
        },
        pending_change: {
            approval_id: 88,
            proposal_id: 'proposal-threat-steward-88',
            proposal_version: 1,
            status: 'pending',
            requested_at: '2026-07-30T10:00:00Z',
            requested_by_name: 'Alice Requester',
            reason: 'Transfer stewardship',
            generic_label: 'accountability_reassignment',
            mutation_kind: 'threat.edit',
            before: { threat_steward: 'Clara Security' },
            after: { threat_steward: 'Diego Security' },
            derived_impact: { before: {}, after: {} },
            impacted_resources: [{
                resource_type: 'threat',
                resource_name: 'Restricted Threat',
            }],
            capabilities: {
                can_view_diff: true,
                can_cancel: true,
            },
        },
    } as Threat;
}

function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location">{location.pathname}{location.search}</div>;
}

function renderPage(mode: 'view' | 'edit') {
    return render(
        <MemoryRouter initialEntries={[mode === 'edit' ? '/threats/73/edit' : '/threats/73']}>
            <Routes>
                <Route path="*" element={<><ThreatDetailPage mode={mode} /><LocationProbe /></>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('ThreatDetailPage orphan stewardship resolution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.canEdit = true;
        mocks.canViewGovernance = true;
        mocks.cancelApproval.mockResolvedValue({ status: 'cancelled' });
        mocks.fetchThreat.mockResolvedValue(undefined);
        mocks.threat = orphanedThreat();
    });

    it('suppresses ordinary edit and sends an authorized operator to the Threat Governance queue', async () => {
        const user = userEvent.setup();
        const { container } = renderPage('view');

        expect(screen.queryByTestId('threat-detail-edit')).not.toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent('messages.steward_orphaned_governance');

        await user.click(screen.getByTestId('threat-orphan-governance'));
        expect(screen.getByTestId('location')).toHaveTextContent('/governance?type=threat');

        const results = await axe.run(container, {
            runOnly: { type: 'tag', values: AXE_TAGS },
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(results.violations.map((violation) => violation.id)).toEqual([]);
    });

    it('shows Governance guidance before the generic capability gate when pending can_update is false', () => {
        mocks.canEdit = false;
        renderPage('edit');

        expect(screen.getByTestId('threat-orphan-edit-blocked')).toHaveTextContent(
            'messages.steward_orphaned_governance',
        );
        expect(screen.getByTestId('threat-orphan-governance')).toBeInTheDocument();
        expect(screen.queryByTestId('threat-form')).not.toBeInTheDocument();
    });

    it('blocks a direct pending-governance edit route and tells a non-Governance user to ask a CRO', () => {
        mocks.canViewGovernance = false;
        renderPage('edit');

        expect(screen.getByTestId('threat-orphan-edit-blocked')).toHaveTextContent(
            'messages.steward_orphaned_request',
        );
        expect(screen.queryByTestId('threat-orphan-governance')).not.toBeInTheDocument();
        expect(screen.queryByTestId('threat-form')).not.toBeInTheDocument();
    });

    it('keeps a legacy unassigned Threat editable so an active CISO can be assigned', () => {
        mocks.threat = {
            ...orphanedThreat(),
            threat_steward_user_id: null,
            threat_steward: null,
            steward_orphaned: false,
            stewardship_status: 'legacy_unassigned',
        };

        renderPage('edit');

        expect(screen.getByRole('alert')).toHaveTextContent('messages.stewardship_legacy_unassigned');
        expect(screen.getByTestId('threat-form')).toBeInTheDocument();
        expect(screen.getByTestId('threat-form')).toHaveAttribute('data-steward-id', '');
    });

    it('clears an invalid assignment in the edit form so it cannot be silently resubmitted', () => {
        mocks.threat = {
            ...orphanedThreat(),
            steward_orphaned: false,
            stewardship_status: 'invalid_assignment',
        };

        renderPage('edit');

        expect(screen.getByRole('alert')).toHaveTextContent('messages.stewardship_invalid_assignment');
        expect(screen.getByTestId('threat-form')).toHaveAttribute('data-steward-id', '');
    });

    it('shows an accessible pending banner with safe Steward labels and hides ordinary Edit', async () => {
        mocks.canEdit = false;
        mocks.threat = governedPendingThreat();

        const { container } = renderPage('view');

        expect(screen.getByTestId('threat-pending-change')).toHaveTextContent('pending_change.title');
        expect(screen.getByText('Clara Security')).toBeInTheDocument();
        expect(screen.getByText('Diego Security')).toBeInTheDocument();
        expect(screen.queryByTestId('threat-detail-edit')).not.toBeInTheDocument();
        expect(screen.queryByText('7315')).not.toBeInTheDocument();
        expect(screen.queryByText('8124')).not.toBeInTheDocument();

        const results = await axe.run(container, {
            runOnly: { type: 'tag', values: AXE_TAGS },
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(results.violations.map((violation) => violation.id)).toEqual([]);
    });

    it('blocks a direct edit route with the pending change instead of the generic denied state', () => {
        mocks.canEdit = false;
        mocks.threat = governedPendingThreat();

        renderPage('edit');

        expect(screen.getByTestId('threat-pending-change')).toBeInTheDocument();
        expect(screen.queryByTestId('threat-form')).not.toBeInTheDocument();
    });

    it('lets the requester cancel and refetches the Threat detail overlay', async () => {
        const user = userEvent.setup();
        mocks.canEdit = false;
        mocks.threat = governedPendingThreat();
        renderPage('view');

        await user.click(screen.getByRole('button', { name: 'pending_change.cancel' }));

        await waitFor(() => expect(mocks.cancelApproval).toHaveBeenCalledWith(88));
        expect(mocks.fetchThreat).toHaveBeenCalledTimes(1);
    });
});
