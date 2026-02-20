import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VendorDetailPage } from '@/pages/VendorDetailPage';

const mockNavigate = vi.fn();
const mockSetSearchParams = vi.fn();
const mockGetVendor = vi.fn();
let canIssueWrite = true;

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ id: '31' }),
        useNavigate: () => mockNavigate,
        useSearchParams: () => [new URLSearchParams(), mockSetSearchParams],
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
        getVendor: (...args: unknown[]) => mockGetVendor(...args),
        restoreVendor: vi.fn(),
    },
}));

vi.mock('@/components/vendors/VendorRiskFactorsTab', () => ({ VendorRiskFactorsTab: () => <div>Risk factors tab</div> }));
vi.mock('@/components/vendors/VendorLinkedRisksTab', () => ({ VendorLinkedRisksTab: () => <div>Linked risks tab</div> }));
vi.mock('@/components/vendors/VendorLinkedControlsTab', () => ({ VendorLinkedControlsTab: () => <div>Linked controls tab</div> }));
vi.mock('@/components/vendors/VendorAssessmentsTab', () => ({ VendorAssessmentsTab: () => <div>Assessments tab</div> }));
vi.mock('@/components/vendors/VendorScheduleTab', () => ({ VendorScheduleTab: () => <div>Schedule tab</div> }));
vi.mock('@/components/vendors/VendorContractControlsTab', () => ({ VendorContractControlsTab: () => <div>Contract controls tab</div> }));
vi.mock('@/components/vendors/VendorResilienceTab', () => ({ VendorResilienceTab: () => <div>Resilience tab</div> }));
vi.mock('@/components/vendors/VendorDependenciesTab', () => ({ VendorDependenciesTab: () => <div>Dependencies tab</div> }));
vi.mock('@/components/vendors/VendorIncidentsTab', () => ({ VendorIncidentsTab: () => <div>Incidents tab</div> }));
vi.mock('@/components/vendors/VendorRemediationTab', () => ({ VendorRemediationTab: () => <div>Remediation tab</div> }));
vi.mock('@/components/vendors/VendorSLATab', () => ({ VendorSLATab: () => <div>SLA tab</div> }));
vi.mock('@/components/vendors/VendorSignalsTab', () => ({ VendorSignalsTab: () => <div>Signals tab</div> }));

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
        mockGetVendor.mockResolvedValue({
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
        });
    });

    it('shows create-issue action and opens contextual modal with vendor name', async () => {
        render(<VendorDetailPage />);

        await screen.findByText('Atlas Cloud Services');
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
});

