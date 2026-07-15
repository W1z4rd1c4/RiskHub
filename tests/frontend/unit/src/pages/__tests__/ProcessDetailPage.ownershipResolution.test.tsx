import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import * as axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Process } from '@/types/process';

const mocks = vi.hoisted(() => ({
    canEdit: true,
    canViewGovernance: true,
    language: 'en' as 'en' | 'cs',
    process: null as Process | null,
    ownershipTranslations: {
        en: {
            'processes:ownership_display.unknown_user': 'Unknown user',
            'processes:ownership_display.unknown_department': 'Unknown department',
            'processes:ownership_display.owner_context_unknown': 'Owner context unavailable',
        },
        cs: {
            'processes:ownership_display.unknown_user': 'Neznámý uživatel',
            'processes:ownership_display.unknown_department': 'Neznámý útvar',
            'processes:ownership_display.owner_context_unknown': 'Kontext vlastníka není dostupný',
        },
    },
}));

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({ canViewGovernance: mocks.canViewGovernance }),
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            const translations = mocks.ownershipTranslations[mocks.language] as Record<string, string>;
            return translations[key] ?? key;
        },
    }),
}));

vi.mock('@/pages/processes/useProcessDetailState', () => ({
    useProcessDetailState: () => ({
        canArchive: true,
        canEdit: mocks.canEdit,
        canRestore: false,
        error: null,
        fetchProcess: vi.fn(),
        isAccessDenied: false,
        isLoading: false,
        process: mocks.process,
        restoreProcess: vi.fn(),
        setProcess: vi.fn(),
    }),
}));

vi.mock('@/pages/processes/ProcessForm', () => ({
    ProcessForm: ({ initialData }: { initialData?: Process }) => (
        <div
            data-testid="process-form"
            data-owner-id={initialData?.process_owner_user_id ?? ''}
            data-department-id={initialData?.owning_department_id ?? ''}
        >
            Process form
        </div>
    ),
}));

vi.mock('@/pages/processes/ProcessVendorLinksSection', () => ({
    ProcessVendorLinksSection: () => <div data-testid="process-vendor-links-section" />,
}));

vi.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));

import { ProcessDetailPage } from '@/pages/ProcessDetailPage';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

function orphanedProcess(): Process {
    return {
        id: 74,
        f_code: 'F74',
        l0_area: 'Operations',
        l1_process: 'Claims handling',
        process_owner_user_id: 17,
        process_owner: {
            name: 'Former owner',
            email: 'former-owner@example.test',
            role_name: 'user',
            department_name: 'Operations',
        },
        owning_department_id: 5,
        owning_department: { name: 'Operations', code: 'OPS' },
        owner_orphaned: true,
        ownership_status: 'pending_governance',
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
        <MemoryRouter initialEntries={[mode === 'edit' ? '/processes/74/edit' : '/processes/74']}>
            <Routes>
                <Route path="*" element={<><ProcessDetailPage mode={mode} /><LocationProbe /></>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('ProcessDetailPage ownership resolution', () => {
    beforeEach(() => {
        mocks.canEdit = true;
        mocks.canViewGovernance = true;
        mocks.language = 'en';
        mocks.process = orphanedProcess();
    });

    it('suppresses edit and links an authorized operator to Process Governance accessibly', async () => {
        const user = userEvent.setup();
        const { container } = renderPage('view');

        expect(screen.queryByTestId('process-detail-edit')).not.toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent('messages.owner_orphaned_governance');
        await user.click(screen.getByTestId('process-orphan-governance'));
        expect(screen.getByTestId('location')).toHaveTextContent('/governance?type=process');

        const results = await axe.run(container, {
            runOnly: { type: 'tag', values: AXE_TAGS },
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(results.violations.map((violation) => violation.id)).toEqual([]);
    });

    it('shows record-specific edit and safe separated ownership metadata for an assigned owner', () => {
        mocks.process = {
            ...orphanedProcess(),
            owner_orphaned: false,
            ownership_status: 'assigned',
        };

        renderPage('view');

        expect(screen.getByTestId('process-detail-edit')).toBeVisible();
        expect(screen.getByText('Former owner', { exact: true })).toBeInTheDocument();
        expect(screen.getByText('Operations · user', { exact: true })).toBeInTheDocument();
        expect(screen.getByText('Operations (OPS)', { exact: true })).toBeInTheDocument();
        expect(screen.queryByText('former-owner@example.test', { exact: true })).not.toBeInTheDocument();
    });

    it('shows Governance guidance before the capability gate on the direct edit route', () => {
        mocks.canEdit = false;
        renderPage('edit');

        expect(screen.getByTestId('process-orphan-edit-blocked')).toHaveTextContent(
            'messages.owner_orphaned_governance',
        );
        expect(screen.getByTestId('process-orphan-governance')).toBeInTheDocument();
        expect(screen.queryByTestId('process-form')).not.toBeInTheDocument();
    });

    it('blocks direct edit without exposing a Governance action to an unauthorized user', () => {
        mocks.canViewGovernance = false;
        renderPage('edit');

        expect(screen.getByTestId('process-orphan-edit-blocked')).toHaveTextContent(
            'messages.owner_orphaned_request',
        );
        expect(screen.queryByTestId('process-orphan-governance')).not.toBeInTheDocument();
        expect(screen.queryByTestId('process-form')).not.toBeInTheDocument();
    });

    it('keeps a legacy unassigned Process editable for explicit assignment', () => {
        mocks.process = {
            ...orphanedProcess(),
            process_owner_user_id: null,
            process_owner: null,
            owning_department_id: null,
            owning_department: null,
            owner_orphaned: false,
            ownership_status: 'legacy_unassigned',
        };
        renderPage('edit');

        expect(screen.getByRole('alert')).toHaveTextContent('messages.ownership_legacy_unassigned');
        expect(screen.getByTestId('process-form')).toHaveAttribute('data-owner-id', '');
        expect(screen.getByTestId('process-form')).toHaveAttribute('data-department-id', '');
    });

    it('clears invalid relationships so they cannot be silently resubmitted', () => {
        mocks.process = { ...orphanedProcess(), owner_orphaned: false, ownership_status: 'invalid_assignment' };
        renderPage('edit');

        expect(screen.getByRole('alert')).toHaveTextContent('messages.ownership_invalid_assignment');
        expect(screen.getByTestId('process-form')).toHaveAttribute('data-owner-id', '');
        expect(screen.getByTestId('process-form')).toHaveAttribute('data-department-id', '');
    });

    it.each([
        ['en', 'Unknown user', 'Unknown department', 'Owner context unavailable'],
        ['cs', 'Neznámý uživatel', 'Neznámý útvar', 'Kontext vlastníka není dostupný'],
    ] as const)('renders safe localized detail fallbacks in %s', (language, owner, department, context) => {
        mocks.language = language;
        mocks.process = {
            ...orphanedProcess(),
            process_owner: null,
            owning_department: null,
            owner_orphaned: false,
            ownership_status: 'assigned',
        };
        renderPage('view');

        expect(screen.getByText(owner)).toBeInTheDocument();
        expect(screen.getByText(department)).toBeInTheDocument();
        expect(screen.getByText(context)).toBeInTheDocument();
        expect(screen.queryByText(String(mocks.process.process_owner_user_id))).not.toBeInTheDocument();
        expect(screen.queryByText(String(mocks.process.owning_department_id))).not.toBeInTheDocument();
    });
});
