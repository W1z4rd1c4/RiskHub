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
}));

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({ canViewGovernance: mocks.canViewGovernance }),
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/pages/assets/useAssetDetailState', () => ({
    useAssetDetailState: () => ({
        asset: mocks.asset,
        canArchive: true,
        canEdit: mocks.canEdit,
        canRestore: false,
        error: null,
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

    it('blocks the direct edit route before rendering AssetForm or an ordinary Edit action', () => {
        mocks.asset = pendingAsset('ict_owner');
        renderPage('edit');

        expect(screen.getByTestId('asset-orphan-edit-blocked')).toHaveTextContent(
            'detail.ownership_pending',
        );
        expect(screen.getByRole('button', { name: 'detail.resolve_in_governance' })).toBeInTheDocument();
        expect(screen.queryByTestId('asset-form')).not.toBeInTheDocument();
        expect(screen.queryByTestId('asset-detail-edit')).not.toBeInTheDocument();
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
});
