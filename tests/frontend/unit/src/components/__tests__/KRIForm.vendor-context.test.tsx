import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { KRIFormContainer as KRIForm } from '@/components/kri-form/KRIFormContainer';
import i18n from '@/i18n';
import { ApiClientError } from '@/services/apiClient';

const mockNavigate = vi.fn();
const mockGetRisks = vi.fn();
const mockGetLinkedRisks = vi.fn();
const mockLinkRisk = vi.fn();
const mockLinkKRI = vi.fn();
const mockListVisibleUsers = vi.fn();
const mockGetVendors = vi.fn();
const mockCreateKri = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisks: (...args: unknown[]) => mockGetRisks(...args),
        getRisk: vi.fn(),
    },
}));

vi.mock('@/services/userApi', () => ({
    userApi: {
        listVisibleUsers: (...args: unknown[]) => mockListVisibleUsers(...args),
    },
}));

vi.mock('@/services/vendorApi', () => ({
    vendorApi: {
        getVendors: (...args: unknown[]) => mockGetVendors(...args),
    },
}));

vi.mock('@/services/vendorLinkApi', () => ({
    vendorLinkApi: {
        getLinkedRisks: (...args: unknown[]) => mockGetLinkedRisks(...args),
        linkRisk: (...args: unknown[]) => mockLinkRisk(...args),
        linkKRI: (...args: unknown[]) => mockLinkKRI(...args),
    },
}));

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        createKRI: (...args: unknown[]) => mockCreateKri(...args),
        updateKRI: vi.fn(),
    },
}));

function render(ui: ReactElement) {
    const router = createMemoryRouter([{ path: '/', element: ui }]);
    return rtlRender(<RouterProvider router={router} />);
}

describe('KRIForm vendor and vendor-assignment flows', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetRisks.mockResolvedValue({
            items: [
                {
                    id: 101,
                    risk_id_code: 'RISK-101',
                    name: 'Vendor-linked risk',
                    process: 'Claims',
                    risk_type: 'operational',
                    category: 'Operational',
                    description: 'Risk already linked to the vendor.',
                    department_id: 9,
                    department_name: 'Operations',
                    gross_score: 3,
                    net_score: 2,
                    is_priority: false,
                    status: 'active',
                },
                {
                    id: 202,
                    risk_id_code: 'RISK-202',
                    name: 'Standalone risk',
                    process: 'Finance',
                    risk_type: 'financial',
                    category: 'Financial',
                    description: 'Risk not yet linked to the vendor.',
                    department_id: 12,
                    department_name: 'Finance',
                    gross_score: 4,
                    net_score: 3,
                    is_priority: false,
                    status: 'active',
                },
            ],
            total: 2,
            offset: 0,
            limit: 50,
        });
        mockGetLinkedRisks.mockResolvedValue([
            {
                id: 101,
                risk_id_code: 'RISK-101',
                name: 'Vendor-linked risk',
                process: 'Claims',
                department_id: 9,
                department_name: 'Operations',
                is_priority: false,
                gross_score: 3,
                net_score: 2,
                status: 'active',
                category: 'Operational',
                risk_type: 'operational',
            },
        ]);
        mockListVisibleUsers.mockResolvedValue([]);
        mockGetVendors.mockResolvedValue({
            items: [
                { id: 12, name: 'Vendor Twelve', status: 'active' },
                { id: 21, name: 'Vendor Twenty-One', status: 'active' },
            ],
            total: 2,
            offset: 0,
            limit: 25,
        });
        mockCreateKri.mockResolvedValue({ id: 55 });
    });

    afterAll(() => {
        consoleErrorSpy.mockRestore();
    });

    it('creates a vendor-context KRI and submits vendor assignment in the create payload', async () => {
        render(
            <KRIForm vendorContext={{ vendorId: 12, returnTo: '/vendors/12', vendorName: 'Vendor Twelve' }} />,
        );

        await screen.findByText('Vendor-linked risk');
        fireEvent.click(screen.getByRole('button', { name: /Vendor-linked risk/i }));
        fireEvent.click(screen.getByRole('button', { name: /Next|Další/i }));

        fireEvent.change(screen.getByPlaceholderText(/Customer complaint rate|Míra stížností zákazníků/i), {
            target: { value: 'Vendor KRI Alpha' },
        });
        fireEvent.change(screen.getByPlaceholderText(/Describe what this KRI measures|Popište, co tento KRI měří/i), {
            target: { value: 'Tracks a vendor-specific signal.' },
        });

        fireEvent.click(screen.getByRole('button', { name: /Create KRI|Vytvořit KRI/i }));

        await waitFor(() => {
            expect(mockCreateKri).toHaveBeenCalledWith(
                expect.objectContaining({
                    risk_id: 101,
                    metric_name: 'Vendor KRI Alpha',
                    description: 'Tracks a vendor-specific signal.',
                    linked_vendor_ids: [12],
                    ensure_parent_risk_vendor_ids: undefined,
                }),
            );
        });
        expect(mockNavigate).toHaveBeenCalledWith('/vendors/12', {
            state: {
                vendorFlash: expect.objectContaining({
                    tone: 'success',
                    message: i18n.t('vendors:links.kris.created_and_linked'),
                    ctaHref: '/kris/55',
                }),
            },
        });
    });

    it('submits ensure_parent_risk_vendor_ids when user links a non-linked parent risk before create', async () => {
        render(
            <KRIForm vendorContext={{ vendorId: 12, returnTo: '/vendors/12', vendorName: 'Vendor Twelve' }} />,
        );

        fireEvent.click(screen.getByRole('button', { name: /All readable risks|Všechna dostupná rizika/i }));
        await screen.findByText('Standalone risk');
        fireEvent.click(screen.getByRole('button', { name: /Standalone risk/i }));
        fireEvent.click(screen.getByRole('button', { name: /Next|Další/i }));

        fireEvent.change(screen.getByPlaceholderText(/Customer complaint rate|Míra stížností zákazníků/i), {
            target: { value: 'Vendor KRI Beta' },
        });
        fireEvent.change(screen.getByPlaceholderText(/Describe what this KRI measures|Popište, co tento KRI měří/i), {
            target: { value: 'Tracks a not-yet-linked risk.' },
        });

        fireEvent.click(screen.getByRole('button', { name: /Create KRI|Vytvořit KRI/i }));
        expect(await screen.findByText(/Selected risk is not linked|Vybrané riziko není navázáno/i)).toBeVisible();

        fireEvent.click(screen.getByRole('button', { name: /Link risk and continue|Navázat riziko a pokračovat/i }));

        await waitFor(() => {
            expect(mockCreateKri).toHaveBeenCalledWith(
                expect.objectContaining({
                    risk_id: 202,
                    linked_vendor_ids: [12],
                    ensure_parent_risk_vendor_ids: [12],
                }),
            );
        });
    });

    it('excludes a protected vendor from the create payload and warns when another Vendor proposal is pending', async () => {
        mockLinkKRI.mockRejectedValueOnce(
            new ApiClientError({
                status: 409,
                code: 'vendor_pending_mutation',
                messageKey: 'errorKeys.vendor_pending_mutation',
                rawMessage: 'A governed Vendor change is already pending',
            }),
        );

        render(
            <KRIForm
                vendorContext={{
                    vendorId: 12,
                    returnTo: '/vendors/12',
                    vendorName: 'Vendor Twelve',
                    protectedChangeRequiresApproval: true,
                }}
            />,
        );

        await screen.findByText('Vendor-linked risk');
        fireEvent.click(screen.getByRole('button', { name: /Vendor-linked risk/i }));
        fireEvent.click(screen.getByRole('button', { name: /Next|Další/i }));

        fireEvent.change(screen.getByPlaceholderText(/Customer complaint rate|Míra stížností zákazníků/i), {
            target: { value: 'Vendor KRI Gamma' },
        });
        fireEvent.change(screen.getByPlaceholderText(/Describe what this KRI measures|Popište, co tento KRI měří/i), {
            target: { value: 'Protected vendors go through governance.' },
        });

        fireEvent.click(screen.getByRole('button', { name: /Create KRI|Vytvořit KRI/i }));

        const dialog = await screen.findByRole('alertdialog');
        fireEvent.change(within(dialog).getByRole('textbox', { name: /Request reason|Žádost/i }), {
            target: { value: 'Monitor this protected vendor' },
        });
        fireEvent.click(within(dialog).getByRole('button', { name: /Continue|Pokračovat/i }));

        await waitFor(() => {
            expect(mockCreateKri).toHaveBeenCalledWith(
                expect.objectContaining({
                    risk_id: 101,
                    linked_vendor_ids: [],
                    ensure_parent_risk_vendor_ids: undefined,
                }),
            );
        });
        await waitFor(() => {
            expect(mockLinkKRI).toHaveBeenCalledWith(12, 55, 'Monitor this protected vendor');
        });
        expect(mockNavigate).toHaveBeenCalledWith('/vendors/12', {
            state: {
                vendorFlash: expect.objectContaining({
                    tone: 'warn',
                    message: i18n.t('vendors:links.kris.created_but_not_linked'),
                    ctaHref: '/kris/55',
                }),
            },
        });
    });

    it('collects a reason and opens the queued approval for a protected vendor link', async () => {
        mockLinkKRI.mockResolvedValueOnce({
            status: 'approval_required',
            approval_id: 900,
            proposal_id: 'proposal-1',
            proposal_version: 1,
        });

        render(
            <KRIForm
                vendorContext={{
                    vendorId: 12,
                    returnTo: '/vendors/12',
                    vendorName: 'Vendor Twelve',
                    protectedChangeRequiresApproval: true,
                }}
            />,
        );

        await screen.findByText('Vendor-linked risk');
        fireEvent.click(screen.getByRole('button', { name: /Vendor-linked risk/i }));
        fireEvent.click(screen.getByRole('button', { name: /Next|Další/i }));

        fireEvent.change(screen.getByPlaceholderText(/Customer complaint rate|Míra stížností zákazníků/i), {
            target: { value: 'Vendor KRI Delta' },
        });
        fireEvent.change(screen.getByPlaceholderText(/Describe what this KRI measures|Popište, co tento KRI měří/i), {
            target: { value: 'Queued governed link warns the requester.' },
        });

        fireEvent.click(screen.getByRole('button', { name: /Create KRI|Vytvořit KRI/i }));

        const dialog = await screen.findByRole('alertdialog');
        expect(mockCreateKri).not.toHaveBeenCalled();
        fireEvent.change(within(dialog).getByRole('textbox', { name: /Request reason|Žádost/i }), {
            target: { value: '  Monitor this critical vendor signal  ' },
        });
        fireEvent.click(within(dialog).getByRole('button', { name: /Continue|Pokračovat/i }));

        await waitFor(() => {
            expect(mockLinkKRI).toHaveBeenCalledWith(12, 55, 'Monitor this critical vendor signal');
        });
        expect(mockNavigate).toHaveBeenCalledWith('/approvals?tab=mine&approvalId=900');
    });

    it('queues only the protected parent Risk link before creating the KRI', async () => {
        mockLinkRisk.mockResolvedValueOnce({
            status: 'approval_required',
            approval_id: 899,
            proposal_id: 'proposal-risk',
            proposal_version: 1,
        });

        render(
            <KRIForm
                vendorContext={{
                    vendorId: 12,
                    returnTo: '/vendors/12',
                    vendorName: 'Vendor Twelve',
                    protectedChangeRequiresApproval: true,
                }}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /All readable risks|Všechna dostupná rizika/i }));
        await screen.findByText('Standalone risk');
        fireEvent.click(screen.getByRole('button', { name: /Standalone risk/i }));
        fireEvent.click(screen.getByRole('button', { name: /Next|Další/i }));
        fireEvent.change(screen.getByPlaceholderText(/Customer complaint rate|Míra stížností zákazníků/i), {
            target: { value: 'Governed parent risk KRI' },
        });
        fireEvent.change(screen.getByPlaceholderText(/Describe what this KRI measures|Popište, co tento KRI měří/i), {
            target: { value: 'Queues the parent Risk before KRI creation.' },
        });

        fireEvent.click(screen.getByRole('button', { name: /Create KRI|Vytvořit KRI/i }));
        const mismatchDialog = await screen.findByRole('alertdialog');
        expect(mismatchDialog).toHaveTextContent(
            /KRI has not been created.*request approval to link the parent Risk.*protected Vendor/i,
        );
        expect(within(mismatchDialog).getByRole('button', {
            name: /Request parent Risk link approval/i,
        })).toBeVisible();
        fireEvent.click(within(mismatchDialog).getByRole('button', {
            name: /Request parent Risk link approval/i,
        }));

        const reasonDialog = await screen.findByRole('alertdialog');
        expect(mockCreateKri).not.toHaveBeenCalled();
        fireEvent.change(within(reasonDialog).getByRole('textbox', { name: /Request reason|Žádost/i }), {
            target: { value: '  Govern the parent Risk first  ' },
        });
        fireEvent.click(within(reasonDialog).getByRole('button', { name: /Continue|Pokračovat/i }));

        await waitFor(() => {
            expect(mockLinkRisk).toHaveBeenCalledWith(12, 202, 'Govern the parent Risk first');
            expect(mockNavigate).toHaveBeenCalledWith('/approvals?tab=mine&approvalId=899');
        });
        expect(mockCreateKri).not.toHaveBeenCalled();
        expect(mockLinkKRI).not.toHaveBeenCalled();
    });

    it('continues KRI creation when the protected parent Risk link applies directly', async () => {
        mockLinkRisk.mockResolvedValueOnce({ status: 'linked' });
        mockLinkKRI.mockResolvedValueOnce({ status: 'linked' });

        render(
            <KRIForm
                vendorContext={{
                    vendorId: 12,
                    returnTo: '/vendors/12',
                    vendorName: 'Vendor Twelve',
                    protectedChangeRequiresApproval: true,
                }}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /All readable risks|Všechna dostupná rizika/i }));
        await screen.findByText('Standalone risk');
        fireEvent.click(screen.getByRole('button', { name: /Standalone risk/i }));
        fireEvent.click(screen.getByRole('button', { name: /Next|Další/i }));
        fireEvent.change(screen.getByPlaceholderText(/Customer complaint rate|Míra stížností zákazníků/i), {
            target: { value: 'Direct parent Risk link KRI' },
        });
        fireEvent.change(screen.getByPlaceholderText(/Describe what this KRI measures|Popište, co tento KRI měří/i), {
            target: { value: 'Continues after the direct parent Risk link.' },
        });

        fireEvent.click(screen.getByRole('button', { name: /Create KRI|Vytvořit KRI/i }));
        fireEvent.click(await screen.findByRole('button', { name: /Request parent Risk link approval/i }));

        const reasonDialog = await screen.findByRole('alertdialog');
        fireEvent.change(within(reasonDialog).getByRole('textbox', { name: /Request reason|Žádost/i }), {
            target: { value: '  Link the parent Risk before creation  ' },
        });
        fireEvent.click(within(reasonDialog).getByRole('button', { name: /Continue|Pokračovat/i }));

        await waitFor(() => {
            expect(mockLinkRisk).toHaveBeenCalledWith(12, 202, 'Link the parent Risk before creation');
            expect(mockCreateKri).toHaveBeenCalledWith(expect.objectContaining({
                risk_id: 202,
                linked_vendor_ids: [],
                ensure_parent_risk_vendor_ids: undefined,
            }));
            expect(mockLinkKRI).toHaveBeenCalledWith(12, 55, 'Link the parent Risk before creation');
        });
        expect(mockNavigate).toHaveBeenCalledWith('/vendors/12', {
            state: {
                vendorFlash: expect.objectContaining({
                    tone: 'success',
                    ctaHref: '/kris/55',
                }),
            },
        });
    });

    it('creates the KRI before queuing its protected Vendor link when continuing without the Risk link', async () => {
        mockLinkKRI.mockResolvedValueOnce({
            status: 'approval_required',
            approval_id: 900,
            proposal_id: 'proposal-kri',
            proposal_version: 1,
        });

        render(
            <KRIForm
                vendorContext={{
                    vendorId: 12,
                    returnTo: '/vendors/12',
                    vendorName: 'Vendor Twelve',
                    protectedChangeRequiresApproval: true,
                }}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /All readable risks|Všechna dostupná rizika/i }));
        await screen.findByText('Standalone risk');
        fireEvent.click(screen.getByRole('button', { name: /Standalone risk/i }));
        fireEvent.click(screen.getByRole('button', { name: /Next|Další/i }));
        fireEvent.change(screen.getByPlaceholderText(/Customer complaint rate|Míra stížností zákazníků/i), {
            target: { value: 'Governed KRI only' },
        });
        fireEvent.change(screen.getByPlaceholderText(/Describe what this KRI measures|Popište, co tento KRI měří/i), {
            target: { value: 'Leaves the parent Risk relationship unchanged.' },
        });

        fireEvent.click(screen.getByRole('button', { name: /Create KRI|Vytvořit KRI/i }));
        const mismatchDialog = await screen.findByRole('alertdialog');
        expect(mismatchDialog).toHaveTextContent(
            /create the KRI and request approval for its Vendor link.*parent Risk unchanged/i,
        );
        expect(within(mismatchDialog).getByRole('button', {
            name: /Create KRI and request Vendor link approval/i,
        })).toBeVisible();
        fireEvent.click(within(mismatchDialog).getByRole('button', {
            name: /Create KRI and request Vendor link approval/i,
        }));

        const reasonDialog = await screen.findByRole('alertdialog');
        expect(mockCreateKri).not.toHaveBeenCalled();
        fireEvent.change(within(reasonDialog).getByRole('textbox', { name: /Request reason|Žádost/i }), {
            target: { value: '  Govern only the KRI relationship  ' },
        });
        fireEvent.click(within(reasonDialog).getByRole('button', { name: /Continue|Pokračovat/i }));

        await waitFor(() => {
            expect(mockCreateKri).toHaveBeenCalledWith(expect.objectContaining({
                risk_id: 202,
                linked_vendor_ids: [],
                ensure_parent_risk_vendor_ids: undefined,
            }));
            expect(mockLinkKRI).toHaveBeenCalledWith(12, 55, 'Govern only the KRI relationship');
            expect(mockNavigate).toHaveBeenCalledWith('/approvals?tab=mine&approvalId=900');
        });
        expect(mockLinkRisk).not.toHaveBeenCalled();
    });

    it('surfaces the backend protected-vendor rejection as a form alert on the generic form', async () => {
        mockCreateKri.mockRejectedValueOnce(
            new ApiClientError({
                status: 422,
                code: 'governed_vendor_relationship_required',
                messageKey: 'errorKeys.governed_vendor_relationship_required',
                rawMessage:
                    'A protected Vendor relationship requires independent approval. '
                    + 'Submit it via POST /api/v1/vendors/{vendor_id}/linked-kris',
            }),
        );

        render(<KRIForm />);

        await screen.findByText('Vendor-linked risk');
        fireEvent.click(screen.getByRole('button', { name: /Vendor-linked risk/i }));
        fireEvent.click(screen.getByRole('button', { name: /Next|Další/i }));

        fireEvent.change(screen.getByPlaceholderText(/Customer complaint rate|Míra stížností zákazníků/i), {
            target: { value: 'Protected Vendor KRI' },
        });
        fireEvent.change(screen.getByPlaceholderText(/Describe what this KRI measures|Popište, co tento KRI měří/i), {
            target: { value: 'Generic create surfaces the governed rejection.' },
        });

        const vendorCheckbox = await screen.findByRole('checkbox', { name: /Vendor Twenty-One/i });
        fireEvent.click(vendorCheckbox);
        fireEvent.click(screen.getByRole('button', { name: /Create KRI|Vytvořit KRI/i }));

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(/linked-kris/);
        expect(mockLinkKRI).not.toHaveBeenCalled();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('blocks generic create and stays on the form when vendor assignment fails validation server-side', async () => {
        mockCreateKri.mockRejectedValueOnce(
            new ApiClientError({
                status: 403,
                code: 'FORBIDDEN',
                messageKey: 'errorKeys.permission_denied',
                rawMessage: 'You are not allowed to assign this vendor.',
            }),
        );

        render(<KRIForm />);

        await screen.findByText('Vendor-linked risk');
        fireEvent.click(screen.getByRole('button', { name: /Vendor-linked risk/i }));
        fireEvent.click(screen.getByRole('button', { name: /Next|Další/i }));

        fireEvent.change(screen.getByPlaceholderText(/Customer complaint rate|Míra stížností zákazníků/i), {
            target: { value: 'Generic Vendor KRI' },
        });
        fireEvent.change(screen.getByPlaceholderText(/Describe what this KRI measures|Popište, co tento KRI měří/i), {
            target: { value: 'Generic create should block on vendor validation errors.' },
        });

        const vendorCheckbox = await screen.findByRole('checkbox', { name: /Vendor Twenty-One/i });
        fireEvent.click(vendorCheckbox);
        fireEvent.click(screen.getByRole('button', { name: /Create KRI|Vytvořit KRI/i }));

        await screen.findByText('You are not allowed to assign this vendor.');
        expect(mockCreateKri).toHaveBeenCalledWith(
            expect.objectContaining({
                risk_id: 101,
                linked_vendor_ids: [21],
            }),
        );
        expect(mockNavigate).not.toHaveBeenCalled();
        expect(screen.getByPlaceholderText(/Customer complaint rate|Míra stížností zákazníků/i)).toHaveValue('Generic Vendor KRI');
    });
});
