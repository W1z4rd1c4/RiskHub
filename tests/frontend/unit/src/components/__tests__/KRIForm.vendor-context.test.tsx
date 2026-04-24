import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { KRIForm } from '@/components/KRIForm';
import { ApiClientError } from '@/services/apiClient';

const mockNavigate = vi.fn();
const mockGetRisks = vi.fn();
const mockGetLinkedRisks = vi.fn();
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
    },
}));

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        createKRI: (...args: unknown[]) => mockCreateKri(...args),
        updateKRI: vi.fn(),
    },
}));

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
