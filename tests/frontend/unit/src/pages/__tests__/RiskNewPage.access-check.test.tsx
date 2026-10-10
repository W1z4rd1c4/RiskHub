import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { RiskNewPage } from '@/pages/RiskNewPage';
import { ApiClientError } from '@/services/apiClient';
import { riskApi } from '@/services/riskApi';
import { vendorApi } from '@/services/vendorApi';

vi.mock('@/services/riskApi', () => ({ riskApi: { getRisks: vi.fn() } }));
vi.mock('@/services/vendorApi', () => ({ vendorApi: { getVendor: vi.fn() } }));
vi.mock('@/components/RiskForm', () => ({ RiskForm: () => <form aria-label="New risk form" /> }));
function Location() { return <output>{useLocation().pathname}{useLocation().search}</output>; }
const allowed = { items: [], total: 0, offset: 0, limit: 1, capabilities: { can_create: true } };
beforeEach(() => { vi.mocked(riskApi.getRisks).mockReset().mockResolvedValue(allowed); vi.mocked(vendorApi.getVendor).mockReset(); });
it.each(['create', 'vendor'])('retries a failed %s check without losing the intended route', async kind => {
    const url = '/risks/new?vendor_id=7&return_to=%2Fvendors%2F7';
    const vendor = { id: 7, name: 'Vendor', capabilities: { can_create_linked_risk: true } };
    vi.mocked(vendorApi.getVendor).mockResolvedValue(vendor as Awaited<ReturnType<typeof vendorApi.getVendor>>);
    const failure = new ApiClientError({ status: 500, messageKey: 'errors.request_failed' });
    if (kind === 'create') vi.mocked(riskApi.getRisks).mockRejectedValueOnce(failure);
    else vi.mocked(vendorApi.getVendor).mockRejectedValueOnce(failure);
    render(<MemoryRouter initialEntries={[url]}><RiskNewPage /><Location /></MemoryRouter>);
    expect(await screen.findByText('Could not check access. Please try again.')).toBeVisible();
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('form', { name: 'New risk form' })).toBeVisible();
    expect(screen.getByRole('status').textContent).toBe(url);
    expect(riskApi.getRisks).toHaveBeenCalledTimes(kind === 'create' ? 2 : 1);
    expect(vendorApi.getVendor).toHaveBeenCalledTimes(kind === 'vendor' ? 2 : 1);
});

function ChangeVendor() {
    const navigate = useNavigate();
    return <button onClick={() => navigate('/risks/new?vendor_id=8&return_to=%2Fvendors%2F8')}>Change vendor</button>;
}
it('ignores a delayed allowed response after changing the linked vendor route', async () => {
    type Vendor = Awaited<ReturnType<typeof vendorApi.getVendor>>;
    let resolveOld!: (value: Vendor) => void;
    vi.mocked(vendorApi.getVendor).mockImplementation(id => id === 7
        ? new Promise(resolve => { resolveOld = resolve; })
        : Promise.resolve({ id: 8, name: 'Other', capabilities: { can_create_linked_risk: false } } as Vendor));
    render(<MemoryRouter initialEntries={['/risks/new?vendor_id=7&return_to=%2Fvendors%2F7']}><RiskNewPage /><ChangeVendor /></MemoryRouter>);
    await waitFor(() => expect(vendorApi.getVendor).toHaveBeenCalledWith(7));
    fireEvent.click(screen.getByRole('button', { name: 'Change vendor' }));
    await waitFor(() => expect(vendorApi.getVendor).toHaveBeenCalledWith(8));
    await screen.findByRole('heading', { name: 'Access Denied' });
    await act(async () => resolveOld({ id: 7, name: 'Old', capabilities: { can_create_linked_risk: true } } as Vendor));
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
});
