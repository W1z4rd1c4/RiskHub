import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import * as axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Asset } from '@/types/asset';

const mocks = vi.hoisted(() => ({
    asset: null as Asset | null,
    canEdit: true,
    canViewGovernance: true,
    error: null as string | null,
}));

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({ canViewGovernance: mocks.canViewGovernance }),
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { date?: string; time?: string }) => (
            key === 'pending_change.requested_by_at'
                ? `${options?.date}|${options?.time}`
                : key
        ),
        i18n: { language: 'cs' },
    }),
}));

vi.mock('@/pages/assets/useAssetDetailState', () => ({
    useAssetDetailState: () => ({
        asset: mocks.asset,
        canArchive: true,
        canEdit: mocks.canEdit,
        canRestore: false,
        error: mocks.error,
        fetchAsset: vi.fn(),
        isAccessDenied: false,
        isLoading: false,
        restoreAsset: vi.fn(),
        setAsset: vi.fn(),
    }),
}));

vi.mock('@/pages/assets/AssetForm', () => ({
    AssetForm: () => <div data-testid="asset-form">Asset form</div>,
}));

vi.mock('@/pages/assets/AssetLinkSections', () => ({
    AssetLinkSections: () => <div data-testid="asset-link-sections" />,
}));

vi.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));

import { AssetDetailPage } from '@/pages/AssetDetailPage';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

function ownedAsset(): Asset {
    return {
        id: 75,
        name: 'Customer account platform',
        business_owner_user_id: 9137,
        ict_owner_user_id: 8246,
        owning_department_id: 7315,
        business_owner: {
            name: 'Business Owner',
            role_name: 'business_user',
            department_name: 'Retail Banking',
        },
        ict_owner: {
            name: 'ICT Owner',
            role_name: 'ict_user',
            department_name: 'Technology',
        },
        owning_department: { name: 'Technology', code: 'TECH' },
        business_owner_orphaned: false,
        ict_owner_orphaned: false,
        ownership_status: 'assigned',
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

function pendingAsset(role: 'business_owner' | 'ict_owner' = 'business_owner'): Asset {
    return {
        ...ownedAsset(),
        business_owner_orphaned: role === 'business_owner',
        ict_owner_orphaned: role === 'ict_owner',
        ownership_status: 'pending_governance',
    };
}

function governedPendingAsset(): Asset {
    return {
        ...ownedAsset(),
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
            approval_id: 86,
            proposal_id: '4c17a671-5b7d-4ed6-a9bb-4ab184ed1ed1',
            proposal_version: 1,
            status: 'pending',
            requested_at: '2026-07-19T10:00:00Z',
            requested_by_name: 'Asset Owner',
            reason: 'Review protected Asset edit',
            generic_label: 'protected_asset_change',
            mutation_kind: 'asset.edit',
            before: { name: 'Customer account platform' },
            after: { name: 'Customer account platform v2' },
            derived_impact: { before: null, after: null },
            impacted_resources: [{ resource_type: 'asset', resource_name: 'Customer account platform' }],
            relationship_change: null,
            capabilities: { can_view_diff: true, can_cancel: true },
        },
    };
}

function redactedGovernedPendingAsset(): Asset {
    return {
        ...ownedAsset(),
        capabilities: {
            can_read: true,
            can_update: false,
            can_archive: false,
            can_restore: false,
            has_pending_change: true,
            business_edit_blocked: true,
            can_cancel_pending_change: false,
        },
        pending_change: {
            approval_id: null,
            proposal_id: null,
            proposal_version: null,
            status: 'pending',
            requested_at: '2026-07-19T10:00:00Z',
            requested_by_name: null,
            reason: '',
            generic_label: 'protected_asset_change',
            mutation_kind: null,
            before: {},
            after: {},
            derived_impact: {},
            impacted_resources: [],
            relationship_change: null,
            capabilities: { can_view_diff: false, can_cancel: false },
        },
    };
}

function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location">{location.pathname}{location.search}</div>;
}

function renderPage(mode: 'view' | 'edit') {
    return render(
        <MemoryRouter initialEntries={[mode === 'edit' ? '/assets/75/edit' : '/assets/75']}>
            <Routes>
                <Route path="*" element={<><AssetDetailPage mode={mode} /><LocationProbe /></>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('AssetDetailPage ownership resolution', () => {
    beforeEach(() => {
        mocks.asset = pendingAsset();
        mocks.canEdit = true;
        mocks.canViewGovernance = true;
        mocks.error = null;
    });

    it('propagates the active Czech locale to pending-change timestamps', () => {
        mocks.asset = governedPendingAsset();
        renderPage('view');

        expect(screen.getByText(/19\. 7\. 2026/)).toBeInTheDocument();
        expect(screen.queryByText(/7\/19\/2026/)).not.toBeInTheDocument();
    });

    it('hides ordinary Edit and sends an authorized operator to the Asset Governance queue', async () => {
        const user = userEvent.setup();
        const { container } = renderPage('view');

        expect(screen.queryByTestId('asset-detail-edit')).not.toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent('detail.ownership_pending');

        await user.click(screen.getByTestId('asset-orphan-governance'));
        expect(screen.getByTestId('location')).toHaveTextContent('/governance?type=asset');

        const results = await axe.run(container, {
            runOnly: { type: 'tag', values: AXE_TAGS },
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(results.violations.map((violation) => violation.id)).toEqual([]);
    });

    it('blocks the direct edit route with an accessible named back action', async () => {
        mocks.asset = pendingAsset('ict_owner');
        const { container } = renderPage('edit');

        expect(screen.getByTestId('asset-orphan-edit-blocked')).toHaveTextContent(
            'detail.ownership_pending',
        );
        expect(screen.getByRole('button', { name: 'detail.resolve_in_governance' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'actions.back_to_register' })).toBeInTheDocument();
        expect(screen.queryByTestId('asset-form')).not.toBeInTheDocument();
        expect(screen.queryByTestId('asset-detail-edit')).not.toBeInTheDocument();
        const results = await axe.run(container, {
            runOnly: { type: 'tag', values: AXE_TAGS },
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(results.violations.map((violation) => violation.id)).toEqual([]);
    });

    it('keeps the governance resolution action capability-gated without removing the back action', () => {
        mocks.asset = pendingAsset('ict_owner');
        mocks.canViewGovernance = false;
        renderPage('edit');

        expect(screen.queryByRole('button', { name: 'detail.resolve_in_governance' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'actions.back_to_register' })).toBeInTheDocument();
    });

    it('keeps the error-state back action named, non-submitting, and operational', async () => {
        const user = userEvent.setup();
        mocks.asset = null;
        mocks.error = 'errors.load_failed';
        renderPage('view');

        const back = screen.getByRole('button', { name: 'actions.back_to_register' });
        expect(back).toHaveAttribute('type', 'button');
        await user.click(back);
        expect(screen.getByTestId('location')).toHaveTextContent('/assets');
    });

    it.each([
        {
            label: 'governed edit blocked',
            asset: governedPendingAsset,
            mode: 'edit' as const,
            expectedPath: '/assets/75',
            assertState: () => {
                expect(screen.getByTestId('asset-pending-change')).toBeInTheDocument();
                expect(screen.queryByTestId('asset-form')).not.toBeInTheDocument();
            },
        },
        {
            label: 'ownership governance edit blocked',
            asset: pendingAsset,
            mode: 'edit' as const,
            expectedPath: '/assets/75',
            assertState: () => {
                expect(screen.getByTestId('asset-orphan-edit-blocked')).toBeInTheDocument();
                expect(screen.getByRole('button', { name: 'detail.resolve_in_governance' })).toBeInTheDocument();
                expect(screen.queryByTestId('asset-form')).not.toBeInTheDocument();
            },
        },
        {
            label: 'ordinary edit',
            asset: ownedAsset,
            mode: 'edit' as const,
            expectedPath: '/assets/75',
            assertState: () => {
                expect(screen.getByTestId('asset-form')).toBeInTheDocument();
            },
        },
        {
            label: 'detail view',
            asset: ownedAsset,
            mode: 'view' as const,
            expectedPath: '/assets',
            assertState: () => {
                expect(screen.getByTestId('asset-detail-back')).toBeInTheDocument();
                expect(screen.getByTestId('asset-detail-edit')).toBeInTheDocument();
            },
        },
    ])('keeps the $label back action on the shared public control contract', async ({
        asset,
        mode,
        expectedPath,
        assertState,
    }) => {
        const user = userEvent.setup();
        mocks.asset = asset();
        renderPage(mode);
        assertState();

        const back = screen.getByRole('button', { name: 'actions.back_to_register' });
        expect(back).toHaveAttribute('type', 'button');

        await user.click(back);
        expect(screen.getByTestId('location')).toHaveTextContent(expectedPath);
    });

    it('renders owner metadata without exposing emails or raw ownership IDs', () => {
        mocks.asset = ownedAsset();
        const { container } = renderPage('view');

        expect(screen.getByText('Business Owner', { exact: true })).toBeInTheDocument();
        expect(screen.getByText('ICT Owner', { exact: true })).toBeInTheDocument();
        expect(screen.getByText('Retail Banking · business_user', { exact: true })).toBeInTheDocument();
        expect(screen.getByText('Technology · ict_user', { exact: true })).toBeInTheDocument();
        expect(screen.getByText('Technology (TECH)', { exact: true })).toBeInTheDocument();

        expect(screen.queryByText('9137', { exact: true })).not.toBeInTheDocument();
        expect(screen.queryByText('8246', { exact: true })).not.toBeInTheDocument();
        expect(screen.queryByText('7315', { exact: true })).not.toBeInTheDocument();
    });

    it('renders the governed pending diff and blocks the direct edit route', () => {
        mocks.asset = governedPendingAsset();
        const { rerender } = renderPage('view');

        expect(screen.getByTestId('asset-pending-change')).toBeInTheDocument();
        expect(screen.queryByTestId('asset-detail-edit')).not.toBeInTheDocument();

        rerender(
            <MemoryRouter initialEntries={['/assets/75/edit']}>
                <Routes>
                    <Route path="*" element={<AssetDetailPage mode="edit" />} />
                </Routes>
            </MemoryRouter>,
        );
        expect(screen.getByTestId('asset-pending-change')).toBeInTheDocument();
        expect(screen.queryByTestId('asset-form')).not.toBeInTheDocument();
    });

    it('renders the generic pending banner from a redacted Asset API projection', () => {
        mocks.asset = redactedGovernedPendingAsset();
        renderPage('view');

        expect(screen.getByTestId('asset-pending-change')).toBeInTheDocument();
        expect(screen.getByText('pending_change.badge')).toBeInTheDocument();
        expect(screen.getByText('pending_change.diff_restricted')).toBeInTheDocument();
        expect(screen.queryByTestId('asset-pending-change-diff')).not.toBeInTheDocument();
        expect(screen.queryByTestId('asset-detail-edit')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'pending_change.cancel' })).not.toBeInTheDocument();
    });
});
