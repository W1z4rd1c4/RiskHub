import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VendorsPage } from '@/pages/VendorsPage';
import { ApiClientError } from '@/services/apiClient';
import type { Vendor, VendorListParams } from '@/types/vendor';

const mockGetVendors = vi.fn();
const mockNavigate = vi.fn();
let hasRiskRead = true;
let vendorCollectionCapabilities: Record<string, boolean> | undefined;

const vendors: Vendor[] = [
    {
        id: 1,
        name: 'Claims Cloud Platform',
        legal_name: null,
        registration_id: null,
        country: null,
        website: null,
        description: null,
        process: 'Claims',
        subprocess: null,
        department_id: 10,
        department_name: 'Operations',
        outsourcing_owner_user_id: 100,
        outsourcing_owner_name: 'Tomas Novak',
        linked_risks: [
            { risk_id: 11, risk_id_code: 'R-001', risk_name: 'Cyber Exposure' },
            { risk_id: 12, risk_id_code: 'R-002', risk_name: 'Concentration Risk' },
        ],
        vendor_type: 'ict',
        risk_score_1_5: 4,
        supports_important_core_insurance_function: true,
        dora_relevant: true,
        is_significant_vendor: false,
        materiality_assessed_max_impact_pct_own_funds: null,
        replaceability: null,
        has_alternative_providers: false,
        status: 'active',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
    },
    {
        id: 2,
        name: 'AML Screening Service',
        legal_name: null,
        registration_id: null,
        country: null,
        website: null,
        description: null,
        process: 'Compliance',
        subprocess: null,
        department_id: 11,
        department_name: 'Compliance',
        outsourcing_owner_user_id: 101,
        outsourcing_owner_name: 'Petra Svobodova',
        linked_risks: [{ risk_id: 12, risk_id_code: 'R-002', risk_name: 'Concentration Risk' }],
        vendor_type: 'outsourcing',
        risk_score_1_5: 5,
        supports_important_core_insurance_function: false,
        dora_relevant: false,
        is_significant_vendor: true,
        materiality_assessed_max_impact_pct_own_funds: null,
        replaceability: null,
        has_alternative_providers: false,
        status: 'active',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
    },
    {
        id: 3,
        name: 'Print Partner',
        legal_name: null,
        registration_id: null,
        country: null,
        website: null,
        description: null,
        process: 'Operations',
        subprocess: null,
        department_id: 12,
        department_name: 'IT',
        outsourcing_owner_user_id: 102,
        outsourcing_owner_name: 'Martin Prochazka',
        linked_risks: [],
        vendor_type: 'partner',
        risk_score_1_5: 2,
        supports_important_core_insurance_function: false,
        dora_relevant: false,
        is_significant_vendor: false,
        materiality_assessed_max_impact_pct_own_funds: null,
        replaceability: null,
        has_alternative_providers: false,
        status: 'active',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
    },
];

function filterVendors(params: VendorListParams = {}) {
    return vendors.filter((vendor) => {
        if (params.status && vendor.status !== params.status) {
            return false;
        }
        if (!params.status && !params.include_archived && vendor.status !== 'active') {
            return false;
        }
        if (params.vendor_type && vendor.vendor_type !== params.vendor_type) {
            return false;
        }
        if (params.search) {
            const search = params.search.toLowerCase();
            const haystack = [vendor.name, vendor.process, vendor.department_name, vendor.vendor_type]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            if (!haystack.includes(search)) {
                return false;
            }
        }
        return true;
    });
}

function vendorGroupValues(vendor: Vendor, groupBy: string): string[] {
    if (groupBy === 'department') {
        return [vendor.department_name || '__unassigned__'];
    }
    if (groupBy === 'process') {
        return [vendor.process || '__no_process__'];
    }
    if (groupBy === 'type') {
        return [vendor.vendor_type];
    }
    if (groupBy === 'risk') {
        return vendor.linked_risks.length > 0
            ? vendor.linked_risks.map((risk) => `risk:${risk.risk_id}`)
            : ['__unlinked_risk__'];
    }
    if (groupBy === 'flag') {
        const values: string[] = [];
        if (vendor.dora_relevant) values.push('__dora_relevant__');
        if (vendor.supports_important_core_insurance_function) values.push('__supports_core_function__');
        if (vendor.is_significant_vendor) values.push('__significant_vendor__');
        return values.length > 0 ? values : ['__insignificant_vendor__'];
    }
    return [];
}

function vendorGroupLabel(value: string): string {
    if (value.startsWith('risk:')) {
        const riskId = Number(value.replace('risk:', ''));
        const risk = vendors.flatMap((vendor) => vendor.linked_risks).find((item) => item.risk_id === riskId);
        return risk ? `${risk.risk_id_code}: ${risk.risk_name}` : value;
    }
    return value;
}

function buildVendorGroups(items: Vendor[], groupBy: string) {
    const counts = new Map<string, number>();
    for (const vendor of items) {
        for (const value of vendorGroupValues(vendor, groupBy)) {
            counts.set(value, (counts.get(value) ?? 0) + 1);
        }
    }
    return [...counts.entries()].map(([value, count]) => ({ value, label: vendorGroupLabel(value), count }));
}

vi.mock('@/hooks/usePermissions', () => ({
    usePermissions: () => ({
        hasPermission: (resource: string, action: string) => {
            if (resource === 'vendors') {
                return action === 'read' || action === 'write' || action === 'delete';
            }
            if (resource === 'risks') {
                return hasRiskRead && action === 'read';
            }
            return false;
        },
    }),
}));

vi.mock('@/services/vendorApi', () => ({
    vendorApi: {
        getVendors: (...args: unknown[]) => mockGetVendors(...args),
        restoreVendor: vi.fn(),
    },
}));

vi.mock('@/services/reportApi', () => ({
    reportApi: {
        exportVendors: vi.fn(),
    },
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

describe('VendorsPage grouped views', () => {
    beforeEach(() => {
        hasRiskRead = true;
        vendorCollectionCapabilities = {
            can_create: true,
            can_view_risk_contexts: true,
            can_export: true,
        };
        vi.clearAllMocks();
        mockGetVendors.mockImplementation((params: VendorListParams = {}) => {
            const filtered = filterVendors(params);
            const offset = params.offset ?? 0;
            const limit = params.limit ?? 10;
            if (params.group_by) {
                const groupedItems = params.group_value
                    ? filtered.filter((vendor) => vendorGroupValues(vendor, params.group_by as string).includes(params.group_value as string))
                    : [];
                return Promise.resolve({
                    items: groupedItems.slice(offset, offset + limit),
                    total: params.group_value ? groupedItems.length : filtered.length,
                    offset,
                    limit,
                    groups: buildVendorGroups(filtered, params.group_by),
                    capabilities: vendorCollectionCapabilities
                        ? { ...vendorCollectionCapabilities, can_view_risk_contexts: hasRiskRead }
                        : undefined,
                });
            }
            return Promise.resolve({
                items: filtered.slice(offset, offset + limit),
                total: filtered.length,
                offset,
                limit,
                capabilities: vendorCollectionCapabilities
                    ? { ...vendorCollectionCapabilities, can_view_risk_contexts: hasRiskRead }
                    : undefined,
            });
        });
    });

    it.each([
        ['false capability', { can_create: true, can_view_risk_contexts: true, can_export: false }],
        ['missing capability', { can_create: true, can_view_risk_contexts: true }],
        ['missing capabilities', undefined],
    ])('hides export when vendor list returns %s', async (_caseName, capabilities) => {
        vendorCollectionCapabilities = capabilities;

        render(<VendorsPage />);

        await screen.findByText('Claims Cloud Platform');
        expect(screen.queryByTestId('vendors-export-button')).not.toBeInTheDocument();
    });

    it('shows export when vendor list can_export is true', async () => {
        render(<VendorsPage />);

        await screen.findByText('Claims Cloud Platform');
        expect(screen.getByTestId('vendors-export-button')).toBeInTheDocument();
    });

    it('renders denied and clears collection actions when vendor reads are forbidden', async () => {
        mockGetVendors
            .mockResolvedValueOnce({
                items: vendors.slice(0, 1),
                total: 1,
                offset: 0,
                limit: 10,
                capabilities: { can_create: true, can_export: true, can_view_risk_contexts: true },
            })
            .mockRejectedValueOnce(
                new ApiClientError({
                    status: 403,
                    messageKey: 'errorKeys.forbidden',
                })
            );

        render(<VendorsPage />);

        await screen.findByText('Claims Cloud Platform');
        expect(screen.getByTestId('vendors-export-button')).toBeInTheDocument();
        expect(screen.getByTestId('vendors-create-button')).toBeInTheDocument();

        await userEvent.click(screen.getByTestId('vendors-refresh-button'));

        await screen.findByRole('heading', { name: /access denied/i });
        expect(screen.queryByText('Claims Cloud Platform')).not.toBeInTheDocument();
        expect(screen.queryByTestId('vendors-export-button')).not.toBeInTheDocument();
        expect(screen.queryByTestId('vendors-create-button')).not.toBeInTheDocument();
    });

    it('shows vendor drill-down tabs and keeps the all view paginated', async () => {
        const ui = userEvent.setup();
        render(<VendorsPage />);

        await screen.findByText('Claims Cloud Platform');
        expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'By Department' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'By Process' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'By Type' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'By Risk' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'By Flag' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'By Category' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'By Vendor' })).not.toBeInTheDocument();
        expect(document.body).toHaveTextContent(/Showing\s*1\s*to\s*3\s*of\s*3\s*results/i);

        await ui.click(screen.getByRole('button', { name: 'By Type' }));

        expect(await screen.findByRole('button', { name: /ICT/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Outsourcing/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Partner/i })).toBeInTheDocument();
        expect(document.body).not.toHaveTextContent(/Showing\s*1\s*to/i);
    });

    it('groups by linked risk with overlapping counts and an unlinked fallback bucket', async () => {
        const ui = userEvent.setup();
        render(<VendorsPage />);

        await screen.findByText('Claims Cloud Platform');
        await ui.click(screen.getByRole('button', { name: 'By Risk' }));

        await waitFor(() => {
            expect(mockGetVendors).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    offset: 0,
                    limit: 10,
                    group_by: 'risk',
                    include_archived: false,
                    status: 'active',
                })
            );
        });

        await ui.click(await screen.findByRole('button', { name: /R-002: Concentration Risk/i }));
        expect(await screen.findByText('Claims Cloud Platform')).toBeInTheDocument();
        expect(screen.getByText('AML Screening Service')).toBeInTheDocument();

        await ui.click(screen.getByRole('button', { name: 'Back' }));
        await ui.click(screen.getByRole('button', { name: /Unlinked Risk/i }));
        expect(await screen.findByText('Print Partner')).toBeInTheDocument();
        expect(screen.queryByText('Claims Cloud Platform')).not.toBeInTheDocument();
    });

    it('hides the risk tab when the user cannot read risks', async () => {
        hasRiskRead = false;
        render(<VendorsPage />);

        await screen.findByText('Claims Cloud Platform');
        expect(screen.queryByRole('button', { name: 'By Risk' })).not.toBeInTheDocument();
    });

    it('keeps grouped fetches constrained by the active search filter', async () => {
        const ui = userEvent.setup();
        render(<VendorsPage />);

        await screen.findByText('Claims Cloud Platform');

        fireEvent.change(screen.getByTestId('vendors-search-input'), { target: { value: 'AML' } });

        await waitFor(() => {
            expect(mockGetVendors).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    search: 'AML',
                    offset: 0,
                    limit: 10,
                })
            );
        });

        await ui.click(screen.getByRole('button', { name: 'By Department' }));

        await waitFor(() => {
            expect(mockGetVendors).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    search: 'AML',
                    offset: 0,
                    limit: 10,
                    group_by: 'department',
                })
            );
        });

        expect(await screen.findByRole('button', { name: /Compliance/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Operations/i })).not.toBeInTheDocument();
    });

    it('groups by flags with multi-membership and an insignificant fallback bucket', async () => {
        const ui = userEvent.setup();
        render(<VendorsPage />);

        await screen.findByText('Claims Cloud Platform');
        await ui.click(screen.getByRole('button', { name: 'By Flag' }));

        expect(await screen.findByRole('button', { name: /^DORA relevant/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Supports core function/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Significant vendor 1 Items$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Insignificant vendors 1 Items$/i })).toBeInTheDocument();

        await ui.click(screen.getByRole('button', { name: /^DORA relevant/i }));
        expect(await screen.findByText('Claims Cloud Platform')).toBeInTheDocument();
        expect(screen.queryByText('AML Screening Service')).not.toBeInTheDocument();

        await ui.click(screen.getByRole('button', { name: 'Back' }));
        await ui.click(screen.getByRole('button', { name: /^Insignificant vendors 1 Items$/i }));
        expect(await screen.findByText('Print Partner')).toBeInTheDocument();
        expect(screen.queryByText('Claims Cloud Platform')).not.toBeInTheDocument();
    });
});
