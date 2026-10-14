import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '@/contexts/AuthContext';
import { FeedbackProvider } from '@/contexts/FeedbackContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { AssetsPage } from '@/pages/AssetsPage';
import { ControlsPage } from '@/pages/ControlsPage';
import { KRIsPage } from '@/pages/KRIsPage';
import { ProcessesPage } from '@/pages/ProcessesPage';
import { RisksPage } from '@/pages/RisksPage';
import { ThreatsPage } from '@/pages/ThreatsPage';
import { VendorsPage } from '@/pages/VendorsPage';
import { applyAuthenticatedSession, applyBootstrappedSession, getSessionOwnershipSnapshot, getSessionSnapshot, setLogoutPendingState } from '@/services/session';
import { mockAuthUser, mockControlSummaries, mockControls, mockRisks, mockRiskSummaries } from '@test/mocks/handlers';
import { server } from '@test/mocks/server';
import { createTestQueryClient } from '@test/queryClient';

const registers = [
    { collection: 'assets', element: <AssetsPage /> },
    { collection: 'controls', element: <ControlsPage /> },
    { collection: 'kris', element: <KRIsPage /> },
    { collection: 'processes', element: <ProcessesPage /> },
    { collection: 'risks', element: <RisksPage /> },
    { collection: 'threats', element: <ThreatsPage /> },
    { collection: 'vendors', element: <VendorsPage /> },
] as const;

function row(collection: string, archived = true) {
    const capabilityFlags = [
        'can_read', 'can_update', 'can_update_sensitive_fields', 'can_request_update_approval',
        'can_archive_immediately', 'can_request_archive_approval', 'can_restore', 'can_send_questionnaire',
        'can_create_kri', 'can_create_linked_control', 'can_link_controls', 'can_unlink_controls',
        'can_view_linked_controls', 'can_view_linked_vendors', 'can_create_issue',
        'has_pending_delete_approval', 'has_pending_update_approval', 'requires_privileged_update_approval',
        'requires_privileged_delete_approval', 'can_log_execution', 'can_view_executions',
        'can_link_risk', 'can_unlink_risk', 'can_view_linked_risks', 'is_archived', 'is_executable',
        'can_submit_value', 'can_submit_backdated_value', 'can_request_value_submission_approval',
        'can_view_history', 'can_request_history_correction', 'can_apply_history_correction_immediately',
        'can_link_vendors', 'can_unlink_vendors', 'has_pending_value_submission_approval',
        'has_pending_history_correction_approval', 'can_archive', 'can_create_linked_risk',
        'can_link_control', 'can_link_kri', 'can_view_linked_kris', 'can_create_linked_kri',
        'can_view_contracts', 'can_manage_contracts', 'can_view_sub_outsourcing', 'can_manage_sub_outsourcing',
        'can_view_asset_links', 'can_manage_asset_links', 'can_manage_process_links',
        'protected_change_requires_approval', 'has_pending_change', 'business_edit_blocked',
        'can_cancel_pending_change', 'can_request_change',
    ];
    return {
        ...(collection === 'risks' ? { ...mockRisks[0], ...mockRiskSummaries[0] } : {}),
        ...(collection === 'controls' ? { ...mockControls[0], ...mockControlSummaries[0] } : {}),
        id: 7, name: 'Captured record', metric_name: 'Captured record', l1_process: 'Captured record',
        visible_linked_risk_count: 0, f_code: 'P7', l0_area: 'Operations', process: 'Operations', risk_id: 1,
        description: 'Test restore target', current_value: 1, lower_limit: 0, upper_limit: 5,
        unit: '%', breach_status: 'within', frequency: 'monthly',
        outsourcing_owner_user_id: 1, linked_risks: [], vendor_type: 'ict', risk_score_1_5: 1,
        supports_important_core_insurance_function: false, dora_relevant: false,
        is_significant_vendor: false, has_alternative_providers: false,
        owner_orphaned: false, business_owner_orphaned: false, ict_owner_orphaned: false,
        threat_steward_orphaned: false, ownership_status: 'assigned', stewardship_status: 'assigned',
        created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z',
        last_updated: '2026-10-01T10:00:00Z', is_archived: archived,
        capabilities: { ...Object.fromEntries(capabilityFlags.map((key) => [key, false])), can_read: true, can_restore: archived },
    };
}

function setup(testCase: typeof registers[number], refreshOnRetry = false) {
    applyBootstrappedSession({ token: 'restore-session', user: mockAuthUser });
    let reads = 0;
    const restored: number[] = [];
    let fail = true;
    server.use(
        http.get(`*/api/v1/${testCase.collection}`, () => {
            reads += 1;
            return HttpResponse.json({ items: [row(testCase.collection)], total: 80, offset: 20, limit: 20,
                facets: {}, groups: [], pending_creations: [],
                capabilities: { can_create: false, can_export: true, can_view_risk_contexts: true, can_view_vendor_contexts: true },
            });
        }),
        http.post(`*/api/v1/${testCase.collection}/:id/restore`, ({ params }) => {
            restored.push(Number(params.id));
            if (refreshOnRetry && restored.length === 2) return HttpResponse.json({ detail: 'Expired' }, { status: 401 });
            return fail ? HttpResponse.json({ detail: 'Restore rejected' }, { status: 422 }) : HttpResponse.json(row(testCase.collection, false));
        }),
    );
    if (refreshOnRetry) server.use(http.post('*/api/v1/auth/refresh', () => HttpResponse.json({
        access_token: 'rotated-restore-token', token_type: 'bearer', user: mockAuthUser,
    })));
    const router = createMemoryRouter([{ path: `/${testCase.collection}`, element: testCase.element }], {
        initialEntries: [`/${testCase.collection}?page=2&source=restore`],
    });
    render(<QueryClientProvider client={createTestQueryClient()}><AuthProvider><LanguageProvider><FeedbackProvider>
        <RouterProvider router={router} />
    </FeedbackProvider></LanguageProvider></AuthProvider></QueryClientProvider>);
    return { router, restored, reads: () => reads, succeed: () => { fail = false; } };
}

describe.each(registers)('$collection captured row restore Retry', (testCase) => {
    it('keeps rows and pagination, then retries the same action before refreshing the list', async () => {
        const context = setup(testCase);
        fireEvent.click(await screen.findByRole('button', { name: 'Restore Captured record' }));
        const retry = await screen.findByRole('button', { name: 'Retry' });
        const readsAfterFailure = context.reads();
        expect(context.restored).toEqual([7]);
        expect(screen.getByRole('button', { name: 'Restore Captured record' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
        expect(context.router.state.location.search).toBe('?page=2&source=restore');
        const register = within(screen.getByTestId(`${testCase.collection}-register-shell`));
        expect(register.queryByRole('alert')).not.toBeInTheDocument();
        expect(register.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
        expect(retry.closest('li')).toHaveAttribute('data-tone', 'danger');
        context.succeed();
        fireEvent.click(retry);
        await waitFor(() => expect(context.restored).toEqual([7, 7]));
        await waitFor(() => expect(context.reads()).toBe(readsAfterFailure + 1));
        expect(context.router.state.location.search).toBe('?page=2&source=restore');
    });

    it('preserves a captured Retry through a real 401 silent refresh and blocks duplicate activation', async () => {
        const context = setup(testCase, true);
        fireEvent.click(await screen.findByRole('button', { name: 'Restore Captured record' }));
        const retry = await screen.findByRole('button', { name: 'Retry' });
        const readsAfterFailure = context.reads();
        const owner = getSessionOwnershipSnapshot();
        context.succeed();
        act(() => { fireEvent.click(retry); fireEvent.click(retry); });
        await waitFor(() => expect(context.restored).toEqual([7, 7, 7]));
        await waitFor(() => expect(context.reads()).toBe(readsAfterFailure + 1));
        expect(getSessionSnapshot().token).toBe('rotated-restore-token');
        expect(getSessionOwnershipSnapshot()).toEqual(owner);
        expect(context.router.state.location.search).toBe('?page=2&source=restore');
    });

    it.each(['query A to B to A', 'fresh login', 'logout'] as const)('revokes a retained Retry after %s', async (change) => {
        const context = setup(testCase);
        fireEvent.click(await screen.findByRole('button', { name: 'Restore Captured record' }));
        const retry = await screen.findByRole('button', { name: 'Retry' });
        if (change === 'query A to B to A') {
            await act(() => context.router.navigate(`/${testCase.collection}?page=3&source=restore`));
            await act(() => context.router.navigate(`/${testCase.collection}?page=2&source=restore`));
        } else if (change === 'fresh login') {
            act(() => { applyAuthenticatedSession({ access_token: 'new-login', token_type: 'bearer', user: mockAuthUser }); });
        } else {
            act(() => { setLogoutPendingState(true); });
            act(() => { setLogoutPendingState(false); });
        }
        context.succeed();
        fireEvent.click(retry);
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
        expect(context.restored).toEqual([7]);
    });
});
