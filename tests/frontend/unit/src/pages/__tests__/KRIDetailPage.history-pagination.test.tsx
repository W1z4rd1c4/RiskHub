import { act, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@/services/apiClient';
import { KRIDetailPage } from '@/pages/KRIDetailPage';
import { renderWithQueryClient as render } from '@test/render';

const getKRI = vi.fn();
const getHistory = vi.fn();
let correctionComplete: (() => void) | undefined;
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isLoading: false }) }));
vi.mock('@/services/kriApi', () => ({ kriApi: { getKRI: (...args: unknown[]) => getKRI(...args), getHistory: (...args: unknown[]) => getHistory(...args) } }));
vi.mock('@/services/riskApi', () => ({ riskApi: { getRisk: vi.fn() } }));
vi.mock('@/components/kri/KRIModal', () => ({ KRIModal: () => null }));
vi.mock('@/components/kri/KRIValueModal', () => ({ KRIValueModal: () => null }));
vi.mock('@/components/issues/IssueQuickCreateModal', () => ({ IssueQuickCreateModal: () => null }));
vi.mock('@/components/kris/KRIDetailOverviewTab', () => ({ KRIDetailOverviewTab: () => null }));
vi.mock('@/components/kri/KRIHistoryEditModal', () => ({ KRIHistoryEditModal: ({ kriId, entry, onSuccess }: { kriId: number; entry: { id: number }; onSuccess: () => void }) => { correctionComplete = onSuccess; return <output data-testid="correction">{kriId}:{entry.id}</output>; } }));
vi.mock('@/components/history/HistoryTrendChart', () => ({ HistoryTrendChart: () => <div>Chart</div> }));

function fixture(total: number, kriId = 21) {
    return Array.from({ length: total }, (_, i) => ({
        id: 1000 + total - i, kri_id: kriId, value: total - i, unit: 'units',
        period_start: new Date(Date.UTC(2026, 0, total - i)).toISOString(),
        period_end: new Date(Date.UTC(2026, 0, total - i)).toISOString(),
        recorded_at: new Date(Date.UTC(2026, 0, total - i)).toISOString(),
        lower_limit: 0, upper_limit: 100, breach_status: 'within', recorded_by_name: 'Fixture recorder',
    }));
}
function Navigation() {
    const location = useLocation();
    const navigate = useNavigate();
    return <><output data-testid="url">{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>Back fixture</button><button onClick={() => navigate(1)}>Forward fixture</button><button onClick={() => navigate('/kris/22?tab=history')}>Other KRI</button></>;
}
function mount(path = '/kris/21?tab=history') {
    return render(<MemoryRouter initialEntries={[path]}><Navigation /><Routes><Route path="/kris/:id" element={<KRIDetailPage />} /></Routes></MemoryRouter>);
}
function setFixture(total: number) {
    getHistory.mockImplementation(async (id: number, params: { offset?: number; page?: number; size?: number }) => {
        const offset = params.offset ?? ((params.page ?? 1) - 1) * 50;
        return { items: fixture(total, id).slice(offset, offset + 50), total, capabilities: { can_request_correction: true } };
    });
}
beforeEach(() => {
    vi.clearAllMocks();
    getKRI.mockImplementation(async (id: number) => ({ id, metric_name: `KRI ${id}`, risk_id: null, unit: 'units', lower_limit: 0, upper_limit: 100, capabilities: { can_request_history_correction: true } }));
    setFixture(75);
});

describe('KRI bounded history pagination', () => {
    it('reaches the oldest of 75 entries and discloses the page and date window', async () => {
        mount();
        await screen.findByText('75 units', { selector: 'h4' });
        expect(screen.getByText('1–50 of 75')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Older entries' }));
        await screen.findByText('1 units', { selector: 'h4' });
        expect(screen.getByText('51–75 of 75')).toBeInTheDocument();
        expect(screen.getByText(/Trend shows only this page:/)).toHaveTextContent('Jan 1, 2026');
        expect(screen.getByText(/Comparison choices are limited to this page/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Older entries' })).toBeDisabled();
        expect(screen.getAllByRole('button', { name: /Request correction/i })).toHaveLength(25);
        fireEvent.click(screen.getAllByRole('button', { name: /Request correction/i }).at(-1)!);
        expect(screen.getByTestId('correction')).toHaveTextContent('21:1001');
        expect(getHistory.mock.calls.map(([, params]) => params.size)).toEqual([50, 50]);
    });
    it.each([0, 1, 50, 51, 75])('shows the exact bounded subset for %i entries', async (total) => {
        setFixture(total);
        mount();
        await screen.findByText(`${total ? 1 : 0}–${Math.min(total, 50)} of ${total}`);
        expect(screen.queryAllByRole('heading', { level: 4 }).filter(h => h.textContent?.endsWith('units'))).toHaveLength(Math.min(total, 50));
        expect(screen.getByRole('button', { name: 'Newer entries' })).toBeDisabled();
        if (total > 50) {
            fireEvent.click(screen.getByRole('button', { name: 'Older entries' }));
            await screen.findByText(`51–${total} of ${total}`);
            expect(screen.queryAllByRole('heading', { level: 4 }).filter(h => h.textContent?.endsWith('units'))).toHaveLength(total - 50);
        }
        expect(screen.getByRole('button', { name: 'Older entries' })).toBeDisabled();
    });

    it('reads page from the URL and preserves Back/Forward navigation and other parameters', async () => {
        const view = mount('/kris/21?tab=history&history_page=2&return_to=%2Fkris');
        await screen.findByText('51–75 of 75');
        expect(getHistory.mock.calls[0][1]).toMatchObject({ page: 2, size: 50 });
        fireEvent.click(screen.getByRole('button', { name: 'Newer entries' }));
        await screen.findByText('1–50 of 75');
        expect(screen.getByTestId('url')).toHaveTextContent('/kris/21?tab=history&return_to=%2Fkris');
        fireEvent.click(screen.getByRole('button', { name: 'Back fixture' }));
        await screen.findByText('51–75 of 75');
        fireEvent.click(screen.getByRole('button', { name: 'Forward fixture' }));
        await screen.findByText('1–50 of 75');
        view.unmount();
        mount('/kris/21?tab=history&history_page=2');
        await screen.findByText('51–75 of 75');
    });

    it('clears a failed later page, retries that page, and restores useful focus', async () => {
        mount();
        await screen.findByText('1–50 of 75');
        getHistory.mockRejectedValueOnce(new Error('offline'));
        fireEvent.click(screen.getByRole('button', { name: 'Older entries' }));
        const unavailable = await screen.findByText('History page 2 is unavailable');
        expect(unavailable).toHaveFocus();
        expect(screen.queryByText('75 units', { selector: 'h4' })).not.toBeInTheDocument();
        expect(screen.queryByText('51–75 of 75')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
        await screen.findByText('51–75 of 75');
        expect(getHistory.mock.calls.at(-1)?.[1].page).toBe(2);
    });

    it('ignores an old page response after Back and after switching KRI', async () => {
        mount();
        await screen.findByText('1–50 of 75');
        let release!: (value: unknown) => void;
        getHistory.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
        fireEvent.click(screen.getByRole('button', { name: 'Older entries' }));
        await screen.findByText('Loading history page 2…');
        expect(screen.getByRole('button', { name: 'Older entries' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Back fixture' }));
        await screen.findByText('1–50 of 75');
        await act(async () => release({ items: fixture(75).slice(50), total: 75 }));
        expect(screen.queryByText('1 units', { selector: 'h4' })).not.toBeInTheDocument();
        getHistory.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
        fireEvent.click(screen.getByRole('button', { name: 'Older entries' }));
        await screen.findByText('Loading history page 2…');
        fireEvent.click(screen.getByRole('button', { name: 'Other KRI' }));
        await screen.findByText('1–50 of 75');
        await act(async () => release({ items: fixture(75).slice(50), total: 75 }));
        expect(screen.getByTestId('url')).toHaveTextContent('/kris/22?tab=history');
        expect(screen.queryByText('1 units', { selector: 'h4' })).not.toBeInTheDocument();
    });

    it.each([403, 404])('protected %i continuation clears rows with truthful non-leaky copy and no retry', async (status) => {
        mount();
        await screen.findByText('1–50 of 75');
        getHistory.mockRejectedValueOnce(new ApiClientError({ status, messageKey: status === 403 ? 'errorKeys.forbidden' : 'errorKeys.not_found' }));
        fireEvent.click(screen.getByRole('button', { name: 'Older entries' }));
        await screen.findByText(status === 403 ? 'Access denied to history page 2' : 'History page 2 is unavailable');
        if (status === 403) expect(screen.getByText('You do not have permission to view history.')).toBeInTheDocument();
        else expect(screen.queryByText('You do not have permission to view history.')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Request correction/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Retry/i })).not.toBeInTheDocument();
    });

    it('ignores a completed correction callback owned by a departed history page', async () => {
        mount();
        await screen.findByText('1–50 of 75');
        fireEvent.click(screen.getAllByRole('button', { name: /Request correction/i })[0]);
        const completePreviousPage = correctionComplete!;
        fireEvent.click(screen.getByRole('button', { name: 'Older entries' }));
        await screen.findByText('51–75 of 75');
        await act(async () => completePreviousPage());
        expect(screen.getByText('51–75 of 75')).toBeInTheDocument();
        expect(getHistory).toHaveBeenCalledTimes(2);
    });

});
