import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VendorDetailPage } from '@/pages/VendorDetailPage';
import { ApiClientError } from '@/services/apiClient';

const mockNavigate = vi.fn();
const mockGetVendor = vi.fn();
let canIssueWrite = true;
let mockLocation = { pathname: '/vendors/31', search: '', state: null as null | object };

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ id: '31' }),
        useNavigate: () => mockNavigate,
        useLocation: () => mockLocation,
    };
});

vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({
        isLoading: false,
        user: { id: 2 },
        hasPermission: (resource: string, action: string) => {
            if (resource === 'issues' && action === 'write') {
                return canIssueWrite;
            }
            return true;
        },
    }),
}));

vi.mock('@/hooks/usePermissions', () => ({
    usePermissions: () => ({
        hasPermission: (resource: string, action: string) => {
            if (resource === 'issues' && action === 'write') {
                return canIssueWrite;
            }
            return true;
        },
    }),
}));

vi.mock('@/services/vendorApi', () => ({
    vendorApi: {
        deleteVendor: vi.fn(),
        getVendor: (...args: unknown[]) => mockGetVendor(...args),
        restoreVendor: vi.fn(),
    },
}));

vi.mock('@/components/vendors/VendorLinkedRisksTab', () => ({ VendorLinkedRisksTab: () => <div id="vendor-linked-risks">Linked risks tab</div> }));
vi.mock('@/components/vendors/VendorLinkedControlsTab', () => ({ VendorLinkedControlsTab: () => <div>Linked controls tab</div> }));
vi.mock('@/pages/vendors/VendorOverviewTab', () => ({
    VendorOverviewTab: () => (
        <div>
            <div>Overview tab</div>
            <div id="vendor-linked-kris" data-testid="vendor-linked-kris-target" />
            <div id="vendor-linked-controls" />
        </div>
    ),
}));

vi.mock('@/components/issues/IssueQuickCreateModal', () => ({
    IssueQuickCreateModal: ({
        isOpen,
        contextEntityLabel,
    }: {
        isOpen: boolean;
        contextEntityLabel: string;
    }) => (isOpen ? <div data-testid="issue-modal-context">{contextEntityLabel}</div> : null),
}));

describe('VendorDetailPage issue entry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        canIssueWrite = true;
        mockLocation = { pathname: '/vendors/31', search: '', state: null };
        mockGetVendor.mockImplementation(async () => ({
            id: 31,
            name: 'Atlas Cloud Services',
            vendor_type: 'ict',
            status: 'active',
            legal_name: 'Atlas Cloud Services LLC',
            registration_id: 'REG-123',
            country: 'CZ',
            website: 'https://atlas.example.com',
            description: 'Cloud hosting partner for platform workloads.',
            department_name: 'IT',
            outsourcing_owner_name: 'Anna Kowalski',
            outsourcing_owner_user_id: 2,
            process: 'Infrastructure',
            subprocess: 'Hosting',
            risk_score_1_5: 3,
            supports_important_core_insurance_function: true,
            dora_relevant: true,
            is_significant_vendor: false,
            capabilities: {
                can_archive: true,
                can_restore: false,
                can_create_issue: canIssueWrite,
            },
        }));
    });

    it('shows create-issue action and opens contextual modal with vendor name', async () => {
        render(<VendorDetailPage />);

        await screen.findByText('Atlas Cloud Services');
        expect(screen.getByText('Overview tab')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'New Issue' }));

        expect(screen.getByTestId('issue-modal-context')).toHaveTextContent('Atlas Cloud Services');
        expect(screen.queryByText('#31')).not.toBeInTheDocument();
    });

    it('hides create-issue action when user lacks issues:write', async () => {
        canIssueWrite = false;
        render(<VendorDetailPage />);

        await screen.findByText('Atlas Cloud Services');
        expect(screen.queryByRole('button', { name: 'New Issue' })).not.toBeInTheDocument();
    });

    it('renders denied instead of not found when vendor detail is forbidden', async () => {
        mockGetVendor.mockRejectedValueOnce(
            new ApiClientError({
                status: 403,
                messageKey: 'errorKeys.forbidden',
            })
        );

        render(<VendorDetailPage />);

        await screen.findByRole('heading', { name: /access denied/i });
        expect(screen.queryByText('Atlas Cloud Services')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'New Issue' })).not.toBeInTheDocument();
    });

    it('shows unarchive instead of archive for inactive vendors', async () => {
        mockGetVendor.mockResolvedValueOnce({
            id: 31,
            name: 'Atlas Cloud Services',
            vendor_type: 'ict',
            status: 'inactive',
            legal_name: 'Atlas Cloud Services LLC',
            registration_id: 'REG-123',
            country: 'CZ',
            website: 'https://atlas.example.com',
            description: 'Cloud hosting partner for platform workloads.',
            department_name: 'IT',
            outsourcing_owner_name: 'Anna Kowalski',
            outsourcing_owner_user_id: 2,
            process: 'Infrastructure',
            subprocess: 'Hosting',
            risk_score_1_5: 3,
            supports_important_core_insurance_function: true,
            dora_relevant: true,
            is_significant_vendor: false,
            capabilities: {
                can_archive: false,
                can_restore: true,
                can_create_issue: true,
            },
        });

        render(<VendorDetailPage />);

        await screen.findByText('Atlas Cloud Services');
        expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Unarchive' })).toBeInTheDocument();
    });

    it('re-runs deep-link scrolling when only the vendor pathname changes', async () => {
        let scheduledFrame: FrameRequestCallback | null = null;
        const requestAnimationFrameSpy = vi
            .spyOn(window, 'requestAnimationFrame')
            .mockImplementation((callback: FrameRequestCallback) => {
                scheduledFrame = callback;
                return 1;
            });
        const cancelAnimationFrameSpy = vi
            .spyOn(window, 'cancelAnimationFrame')
            .mockImplementation(() => {});

        mockLocation = {
            pathname: '/vendors/31',
            search: '?tab=assessments&section=schedule',
            state: null,
        };

        const { rerender } = render(<VendorDetailPage />);

        const target = await screen.findByTestId('vendor-linked-kris-target');
        const scrollIntoViewMock = vi.fn();
        Object.defineProperty(target, 'scrollIntoView', {
            configurable: true,
            value: scrollIntoViewMock,
        });

        await waitFor(() => expect(scheduledFrame).not.toBeNull());
        await act(async () => {
            scheduledFrame?.(0);
        });
        expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

        mockLocation = {
            pathname: '/vendors/32',
            search: '?tab=assessments&section=schedule',
            state: null,
        };

        rerender(<VendorDetailPage />);

        await waitFor(() => expect(scheduledFrame).not.toBeNull());
        await act(async () => {
            scheduledFrame?.(0);
        });
        expect(scrollIntoViewMock).toHaveBeenCalledTimes(2);

        requestAnimationFrameSpy.mockRestore();
        cancelAnimationFrameSpy.mockRestore();
    });
});
