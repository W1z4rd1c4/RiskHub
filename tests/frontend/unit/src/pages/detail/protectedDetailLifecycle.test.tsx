import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '@/contexts/AuthContext';
import { FeedbackProvider } from '@/contexts/FeedbackContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ThreatDetailPage } from '@/pages/ThreatDetailPage';
import { VendorDetailPage } from '@/pages/VendorDetailPage';
import { server } from '@test/mocks/server';
import { createTestQueryClient } from '@test/queryClient';

const cases = [
    { entity: 'threat', collection: 'threats', element: <ThreatDetailPage /> },
    { entity: 'vendor', collection: 'vendors', element: <VendorDetailPage /> },
] as const;

function record(entity: string, id = 7, archived = false) {
    return {
        id, name: `Record ${id}`, l1_process: `Record ${id}`, f_code: `P${id}`, l0_area: 'Operations',
        process: 'Operations', outsourcing_owner_user_id: 1, linked_risks: [], vendor_type: 'ict',
        risk_score_1_5: 1, supports_important_core_insurance_function: false, dora_relevant: false,
        is_significant_vendor: false, has_alternative_providers: false,
        owner_orphaned: false, business_owner_orphaned: false, ict_owner_orphaned: false,
        ownership_status: 'assigned', stewardship_status: 'assigned',
        created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z', is_archived: archived,
        capabilities: {
            ...Object.fromEntries([
                'can_create_linked_risk', 'can_create_linked_control', 'can_create_linked_kri',
                'can_link_risk', 'can_link_control', 'can_link_kri', 'can_view_linked_risks',
                'can_view_linked_controls', 'can_view_linked_kris', 'can_create_issue',
                'can_view_contracts', 'can_manage_contracts', 'can_view_sub_outsourcing',
                'can_manage_sub_outsourcing', 'can_view_asset_links', 'can_manage_asset_links',
                'can_manage_process_links',
            ].map((key) => [key, false])),
            can_read: true, can_update: false, can_archive: !archived, can_restore: archived,
            protected_change_requires_approval: false, can_request_change: false,
            can_cancel_pending_change: false, has_pending_change: false, business_edit_blocked: false,
        },
        // The Threat read contract includes its own stewardship projection.
        ...(entity === 'threat' ? { threat_steward_orphaned: false } : {}),
    };
}

function pendingChange(entity: string, canCancel = true, canView = true, approvalId = 701) {
    const common = {
        status: 'pending', requested_at: '2026-10-01T10:00:00Z', requested_by_name: 'Requester',
        approval_id: canView ? approvalId : null, proposal_id: canView ? 'proposal' : null,
        proposal_version: canView ? 1 : null, reason: canView ? 'Captured change reason' : '',
        capabilities: { can_view_diff: canView, can_cancel: canCancel },
    };
    if (entity === 'threat') return {
        ...common, generic_label: 'accountability_reassignment', mutation_kind: canView ? 'threat.edit' : null,
        before: canView ? { threat_steward: 'Prior owner' } : {}, after: canView ? { threat_steward: 'Next owner' } : {},
        derived_impact: canView ? { before: {}, after: {} } : {},
        impacted_resources: canView ? [{ resource_type: 'threat', resource_name: 'Restricted Threat' }] : [],
    };
    return {
        ...common, approval_id: approvalId, proposal_id: 'proposal', proposal_version: 1,
        generic_label: `protected_${entity}_change`, mutation_kind: canView ? `${entity}.edit` : null,
        before: canView ? { name: 'Prior name' } : {}, after: canView ? { name: 'Next name' } : {},
        derived_impact: canView || entity === 'process' ? { before: {}, after: {} } : {},
        impacted_resources: [], relationship_change: null,
    };
}

function cancelledApproval(entity: string, id: number) {
    return {
        id, resource_type: entity, resource_id: 7, resource_name: 'Record 7', action_type: 'edit',
        pending_changes: null, status: 'cancelled', reason: 'Reason', requested_by_id: 1,
        requested_by_name: null, requested_by_email: null, resolved_by_id: null, resolved_by_name: null,
        resolved_at: null, resolution_notes: null, created_at: '2026-10-01T10:00:00Z', can_approve: false, can_reject: false,
    };
}

function setup(testCase: typeof cases[number], archived = false, read?: (id: number) => Response | Promise<Response>) {
    const { entity, collection, element } = testCase;
    server.use(
        http.get(`*/api/v1/${collection}/:id`, ({ params }) => read?.(Number(params.id)) ?? HttpResponse.json(record(entity, Number(params.id), archived))),
        http.get(`*/api/v1/${collection}/:id/*`, () => HttpResponse.json([])),
        http.get('*/api/v1/risks', () => HttpResponse.json({ items: [], total: 0, offset: 0, limit: 100 })),
        http.get('*/api/v1/vendors', () => HttpResponse.json({ items: [], total: 0, offset: 0, limit: 100 })),
        http.get('*/api/v1/ict-register/reference/closed-lists', () => HttpResponse.json({ lists: [] })),
        http.get('*/api/v1/ict-register/reference/ict-service-taxonomy', () => HttpResponse.json({ services: [], cloud_service_codes: [] })),
    );
    const client = createTestQueryClient();
    const router = createMemoryRouter([
        { path: `/${collection}/:id`, element },
        { path: `/${collection}`, element: <h1>Register</h1> },
        { path: '/away', element: <h1>Destination</h1> },
    ], { initialEntries: [`/${collection}/7`] });
    render(<QueryClientProvider client={client}><AuthProvider><LanguageProvider><FeedbackProvider>
        <RouterProvider router={router} />
    </FeedbackProvider></LanguageProvider></AuthProvider></QueryClientProvider>);
    return { router, client, user: userEvent.setup() };
}

describe.each(cases)('$entity protected detail network lifecycle', (testCase) => {
    it('shows loading until the real fetch completes', async () => {
        let release!: () => void;
        const pending = new Promise<void>((resolve) => { release = resolve; });
        setup(testCase, false, async () => { await pending; return HttpResponse.json(record(testCase.entity)); });
        expect(screen.queryByRole('heading', { name: 'Record 7' })).not.toBeInTheDocument();
        expect(screen.queryByTestId('detail-load-unavailable')).not.toBeInTheDocument();
        await act(async () => { release(); await pending; });
        expect(await screen.findByRole('heading', { name: 'Record 7' })).toBeInTheDocument();
    });

    it('returns to the register with a toast for an applied archive', async () => {
        const { user, router } = setup(testCase);
        server.use(http.delete(`*/api/v1/${testCase.collection}/7`, () => new HttpResponse(null, { status: 204 })));
        await screen.findByRole('heading', { name: 'Record 7' });
        await user.click(screen.getByRole('button', { name: /^archive$/i }));
        await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /^archive$/i }));
        await waitFor(() => expect(router.state.location.pathname).toBe(`/${testCase.collection}`));
        expect(screen.getByText('Archived: Record 7')).toBeInTheDocument();
    });

    it.skipIf(testCase.entity === 'threat')('stays on the detail and links the authoritative queued approval', async () => {
        const { user, router } = setup(testCase);
        server.use(http.delete(`*/api/v1/${testCase.collection}/7`, () => HttpResponse.json({
            status: 'approval_required', message: 'Queued', approval_id: 701, action_type: 'archive',
            pending_fields: [], proposal_id: 'proposal', proposal_version: 1,
        }, { status: 202 })));
        await screen.findByRole('heading', { name: 'Record 7' });
        await user.click(screen.getByRole('button', { name: /^archive$/i }));
        await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /^archive$/i }));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
        expect(router.state.location.pathname).toBe(`/${testCase.collection}/7`);
        const links = screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.includes('approval_id=701'));
        expect(links.length).toBeGreaterThan(0);
        expect(links[0]).toHaveAttribute('href', '/approvals?tab=mine&approval_id=701');
        expect(screen.queryByText('Archived: Record 7')).not.toBeInTheDocument();
    });

    it.each([403, 404])('replaces a %i read with the unavailable state', async (status) => {
        setup(testCase, false, () => HttpResponse.json({ detail: 'Unavailable' }, { status }));
        expect(await screen.findByTestId('detail-load-unavailable')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Record 7' })).not.toBeInTheDocument();
    });

    it('keeps the record and allows retry after a stale refresh failure', async () => {
        let fail = false;
        const { client, user } = setup(testCase, false, () => fail
            ? HttpResponse.json({ detail: 'Unavailable' }, { status: 500 })
            : HttpResponse.json(record(testCase.entity)));
        await screen.findByRole('heading', { name: 'Record 7' });
        fail = true;
        await act(() => client.invalidateQueries());
        expect(screen.getByRole('heading', { name: 'Record 7' })).toBeInTheDocument();
        const retry = await screen.findByRole('button', { name: 'Retry' });
        fail = false;
        await user.click(retry);
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument());
    });

    it('clears the archive rejection on close and reopen', async () => {
        const { user } = setup(testCase);
        server.use(http.delete(`*/api/v1/${testCase.collection}/7`, () => HttpResponse.json({ detail: 'Unavailable' }, { status: 500 })));
        await screen.findByRole('heading', { name: 'Record 7' });
        await user.click(screen.getByRole('button', { name: /^archive$/i }));
        await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /^archive$/i }));
        await waitFor(() => expect(within(screen.getByRole('alertdialog')).getByRole('alert')).toBeInTheDocument());
        await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
        await user.click(screen.getByRole('button', { name: /^archive$/i }));
        expect(within(screen.getByRole('alertdialog')).queryByRole('alert')).not.toBeInTheDocument();
    });

    it.each([true, false])('obeys pending diff permission %s and denies cancellation without can_cancel', async (canView) => {
        setup(testCase, false, () => HttpResponse.json({
            ...record(testCase.entity), pending_change: pendingChange(testCase.entity, false, canView),
        }));
        const panel = await screen.findByTestId(`${testCase.entity}-pending-change`);
        expect(within(panel).queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
        expect(within(panel).queryByText('Captured change reason') !== null).toBe(canView);
        expect(panel.className).toContain('border-warning');
    });

    it('captures the named cancellation target and submits it only once while pending', async () => {
        let approvalId = 701;
        const ids: number[] = [];
        let release!: () => void;
        const pending = new Promise<void>((resolve) => { release = resolve; });
        const { client, user, router } = setup(testCase, false, () => HttpResponse.json({
            ...record(testCase.entity), pending_change: pendingChange(testCase.entity, true, true, approvalId),
        }));
        server.use(http.post('*/api/v1/approvals/:id/cancel', async ({ params }) => {
            ids.push(Number(params.id));
            await pending;
            return HttpResponse.json(cancelledApproval(testCase.entity, Number(params.id)));
        }));
        const panel = await screen.findByTestId(`${testCase.entity}-pending-change`);
        await user.click(within(panel).getByRole('button', { name: /cancel/i }));
        const dialog = screen.getByRole('alertdialog');
        expect(dialog.textContent).toContain('Record 7');
        approvalId = 702;
        await act(() => client.invalidateQueries());
        const form = dialog.querySelector('form')!;
        act(() => { fireEvent.submit(form); fireEvent.submit(form); });
        await waitFor(() => expect(ids).toEqual([701]));
        await act(() => router.navigate('/away'));
        await act(async () => { release(); await pending; });
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
        expect(router.state.location.pathname).toBe('/away');
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('already reports restore rejection without removing the loaded record', async () => {
        const { user } = setup(testCase, true);
        server.use(http.post(`*/api/v1/${testCase.collection}/7/restore`, () =>
            HttpResponse.json({ detail: 'Unavailable' }, { status: 500 })));
        await screen.findByRole('heading', { name: 'Record 7' });
        await user.click(screen.getByRole('button', { name: /restore|unarchive/i }));
        await waitFor(() => expect(screen.getByText('The record could not be restored.')).toBeInTheDocument());
        expect(screen.getByRole('heading', { name: 'Record 7' })).toBeInTheDocument();
    });

    it('does not navigate or announce an archive that finishes after leaving the record', async () => {
        let release!: () => void;
        const pending = new Promise<void>((resolve) => { release = resolve; });
        let started = false;
        const { router, user } = setup(testCase);
        server.use(http.delete(`*/api/v1/${testCase.collection}/7`, async () => {
            started = true;
            await pending;
            return new HttpResponse(null, { status: 204 });
        }));
        await screen.findByRole('heading', { name: 'Record 7' });
        await user.click(screen.getByRole('button', { name: /^archive$/i }));
        await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /^archive$/i }));
        await waitFor(() => expect(started).toBe(true));
        await act(() => router.navigate('/away'));
        await act(async () => { release(); await pending; });
        // Let the real fetch decoder and mutation continuation finish.
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
        expect(router.state.location.pathname).toBe('/away');
        expect(screen.queryByText(/Record 7.*archived|Archived.*Record 7/i)).not.toBeInTheDocument();
    });
});
