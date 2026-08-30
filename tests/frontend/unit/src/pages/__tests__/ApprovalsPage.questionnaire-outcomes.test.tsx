import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import i18n from '@/i18n';
import ApprovalsPage from '@/pages/ApprovalsPage';
import type { RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';
import { server } from '@test/mocks/server';

const questionnaire: RiskQuestionnaireListItem = {
    id: 41,
    risk_id: 7,
    risk_name: 'Quarterly operational risk',
    assigned_to_user_id: 2,
    sent_by_user_id: 3,
    status: 'sent',
    template_key: 'quarterly',
    template_version: '1',
    sent_at: '2026-08-20T09:00:00Z',
    due_at: '2026-09-20T09:00:00Z',
    sent_by_user_name: 'Risk Owner',
};

function renderPage() {
    return render(
        <MemoryRouter initialEntries={['/approvals']}>
            <ApprovalsPage />
        </MemoryRouter>,
    );
}

describe('ApprovalsPage questionnaire inbox outcomes', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
    });

    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('shows a focus-stable local retry instead of caught-up copy when the initial inbox request fails', async () => {
        let inboxRequests = 0;
        let releaseRetry!: () => void;
        const retryGate = new Promise<void>((resolve) => { releaseRetry = resolve; });
        server.use(
            http.get('*/api/v1/questionnaires/inbox', async () => {
                inboxRequests += 1;
                if (inboxRequests === 1) {
                    return HttpResponse.json({ detail: 'failed' }, { status: 500 });
                }
                await retryGate;
                return HttpResponse.json([]);
            }),
        );
        const user = userEvent.setup();
        renderPage();
        await user.click(screen.getByRole('tab', { name: 'Risk Assessment' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Could not load questionnaire inbox. Try again.');
        expect(screen.queryByText('All Caught Up')).not.toBeInTheDocument();
        expect(screen.queryByText('There are no open questionnaires assigned to you right now.')).not.toBeInTheDocument();
        const retry = screen.getByRole('button', { name: 'Retry' });

        await user.click(retry);
        await waitFor(() => expect(inboxRequests).toBe(2));
        expect(retry).toHaveFocus();
        expect(retry).toHaveAttribute('aria-disabled', 'true');
        expect(retry).toHaveAttribute('aria-busy', 'true');
        fireEvent.click(retry);
        expect(inboxRequests).toBe(2);

        releaseRetry();
        expect(await screen.findByText('All Caught Up')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('keeps safe questionnaire rows visible and labels them stale when tab refresh fails', async () => {
        let inboxRequests = 0;
        server.use(
            http.get('*/api/v1/questionnaires/inbox', () => {
                inboxRequests += 1;
                return inboxRequests === 1
                    ? HttpResponse.json([questionnaire])
                    : HttpResponse.json({ detail: 'failed' }, { status: 500 });
            }),
        );
        const user = userEvent.setup();
        renderPage();
        await user.click(screen.getByRole('tab', { name: 'Risk Assessment' }));
        await screen.findByText(questionnaire.risk_name!);
        await user.click(screen.getByRole('tab', { name: 'Pending Queue' }));
        await user.click(screen.getByRole('tab', { name: 'Risk Assessment' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Questionnaire assignments may be out of date. Try again.');
        expect(screen.getByText(questionnaire.risk_name!)).toBeInTheDocument();
        expect(screen.queryByText('All Caught Up')).not.toBeInTheDocument();
    });

    it('clears previously loaded questionnaire rows when tab refresh is denied', async () => {
        let inboxRequests = 0;
        server.use(
            http.get('*/api/v1/questionnaires/inbox', () => {
                inboxRequests += 1;
                return inboxRequests === 1
                    ? HttpResponse.json([questionnaire])
                    : HttpResponse.json({ detail: 'forbidden' }, { status: 403 });
            }),
        );
        const user = userEvent.setup();
        renderPage();
        await user.click(screen.getByRole('tab', { name: 'Risk Assessment' }));
        await screen.findByText(questionnaire.risk_name!);
        await user.click(screen.getByRole('tab', { name: 'Pending Queue' }));
        await user.click(screen.getByRole('tab', { name: 'Risk Assessment' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('You do not have access to questionnaire assignments.');
        expect(screen.queryByText(questionnaire.risk_name!)).not.toBeInTheDocument();
        expect(screen.queryByText('All Caught Up')).not.toBeInTheDocument();
    });

    it('keeps the newest questionnaire request authoritative when re-entering the tab', async () => {
        let inboxRequests = 0;
        let releaseOlder!: () => void;
        let releaseNewer!: () => void;
        const olderGate = new Promise<void>((resolve) => { releaseOlder = resolve; });
        const newerGate = new Promise<void>((resolve) => { releaseNewer = resolve; });
        server.use(
            http.get('*/api/v1/questionnaires/inbox', async () => {
                inboxRequests += 1;
                if (inboxRequests === 1) {
                    await olderGate;
                    return HttpResponse.json([questionnaire]);
                }
                await newerGate;
                return HttpResponse.json({ detail: 'forbidden' }, { status: 403 });
            }),
        );
        const user = userEvent.setup();
        renderPage();

        await user.click(screen.getByRole('tab', { name: 'Risk Assessment' }));
        await waitFor(() => expect(inboxRequests).toBe(1));
        await user.click(screen.getByRole('tab', { name: 'Pending Queue' }));
        await user.click(screen.getByRole('tab', { name: 'Risk Assessment' }));
        await waitFor(() => expect(inboxRequests).toBe(2));

        await act(async () => {
            releaseOlder();
            await olderGate;
            await Promise.resolve();
        });

        expect(screen.queryByText(questionnaire.risk_name!)).not.toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Loading...');

        await act(async () => {
            releaseNewer();
            await newerGate;
            await Promise.resolve();
        });

        expect(await screen.findByRole('alert')).toHaveTextContent('You do not have access to questionnaire assignments.');
        expect(screen.queryByText(questionnaire.risk_name!)).not.toBeInTheDocument();
        expect(screen.queryByText('All Caught Up')).not.toBeInTheDocument();
    });
});
