import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import {
    approvalRequestHref,
    navigateToApprovalRequest,
    type ApprovalQueueTab,
} from '@/pages/approvals/approvalNavigation';

function NavigationHarness({ tab }: { tab: ApprovalQueueTab }) {
    const navigate = useNavigate();
    return (
        <button type="button" onClick={() => navigateToApprovalRequest(navigate, 85, tab)}>
            Open request
        </button>
    );
}

function ApprovalLocation() {
    const location = useLocation();
    return <output>{`${location.pathname}${location.search}`}</output>;
}

describe('approval request navigation', () => {
    it.each([
        ['mine', '/approvals?tab=mine&approvalId=85'],
        ['pending', '/approvals?tab=pending&approvalId=85'],
        ['risk_assessment', '/approvals?tab=risk_assessment&approvalId=85'],
        ['all', '/approvals?tab=all&approvalId=85'],
    ] as const)('uses the app router for the %s queue route', (tab, expectedHref) => {
        render(
            <MemoryRouter initialEntries={['/processes/7']}>
                <Routes>
                    <Route path="/processes/:id" element={<NavigationHarness tab={tab} />} />
                    <Route path="/approvals" element={<ApprovalLocation />} />
                </Routes>
            </MemoryRouter>,
        );

        expect(approvalRequestHref(85, tab)).toBe(expectedHref);
        fireEvent.click(screen.getByRole('button', { name: 'Open request' }));
        expect(screen.getByText(expectedHref)).toBeInTheDocument();
    });
});
