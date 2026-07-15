import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import * as axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Threat } from '@/types/threat';

const mocks = vi.hoisted(() => ({
    canEdit: true,
    canViewGovernance: true,
    threat: null as Threat | null,
}));

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({ canViewGovernance: mocks.canViewGovernance }),
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/pages/threats/useThreatDetailState', () => ({
    useThreatDetailState: () => ({
        canArchive: true,
        canEdit: mocks.canEdit,
        canRestore: false,
        error: null,
        fetchThreat: vi.fn(),
        isAccessDenied: false,
        isLoading: false,
        restoreThreat: vi.fn(),
        setThreat: vi.fn(),
        threat: mocks.threat,
    }),
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
        mocks.canEdit = true;
        mocks.canViewGovernance = true;
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
});
