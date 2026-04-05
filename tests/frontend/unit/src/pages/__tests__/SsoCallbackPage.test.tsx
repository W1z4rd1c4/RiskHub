import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/services/entraAuth', () => ({
    entraAuth: {
        handleRedirect: vi.fn(),
    },
}));

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';

import { server } from '@test/mocks/server';
import { mockAuthUser } from '@test/mocks/handlers';
import SsoCallbackPage from '@/pages/SsoCallbackPage';
import { clearAccessToken, getAccessToken } from '@/services/accessTokenStore';
import { entraAuth } from '@/services/entraAuth';

afterEach(() => {
    vi.restoreAllMocks();
    clearAccessToken();
});

describe('SsoCallbackPage', () => {
    it('exchanges id_token and stores RiskHub JWT', async () => {
        clearAccessToken();
        (entraAuth.handleRedirect as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ idToken: 'id-token' });

        server.use(
            http.post('*/api/v1/auth/sso/exchange', async ({ request }) => {
                const body = await request.json();
                expect(body).toEqual({ id_token: 'id-token' });
                return HttpResponse.json({
                    access_token: 'riskhub-jwt',
                    token_type: 'bearer',
                    user: mockAuthUser,
                });
            }),
        );

        render(
            <MemoryRouter initialEntries={['/auth/sso/callback']}>
                <Routes>
                    <Route path="/auth/sso/callback" element={<SsoCallbackPage />} />
                    <Route path="/" element={<div>Dashboard Home</div>} />
                    <Route path="/login" element={<div>Login</div>} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(getAccessToken()).toBe('riskhub-jwt');
        });

        expect(await screen.findByText('Dashboard Home')).toBeInTheDocument();
    });
});
