import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';

import { server } from '@/test/mocks/server';
import LoginPage from '@/pages/LoginPage';
import SsoCallbackPage from '@/pages/SsoCallbackPage';
import { entraAuth } from '@/services/entraAuth';

// Mock i18next so tests don't depend on full i18n initialization.
vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
  };
});

vi.mock('@/services/entraAuth', () => ({
  entraAuth: {
    loginRedirect: vi.fn(async () => {}),
    handleRedirect: vi.fn(async () => null),
    acquireIdTokenSilent: vi.fn(async () => 'id-token'),
  },
}));

vi.mock('@/utils/hardNavigate', () => ({
  hardNavigate: vi.fn(),
}));

function renderLogin(initialEntry = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/sso/callback" element={<SsoCallbackPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LoginPage (SSO + demo modes)', () => {
  beforeEach(() => {
    vi.mocked(entraAuth.handleRedirect).mockResolvedValue(null);
    vi.mocked(entraAuth.loginRedirect).mockResolvedValue(undefined);
  });

  it('renders demo account buttons when demo login is enabled', async () => {
    renderLogin('/login');
    expect(await screen.findByText('System Admin')).toBeInTheDocument();
  });

  it('renders Microsoft SSO button when SSO is enabled', async () => {
    server.use(
      http.get('*/api/v1/auth/config', () => {
        return HttpResponse.json({
          auth_mode: 'microsoft_sso',
          demo_login_enabled: false,
          password_login_enabled: false,
          debug: false,
          mock_auth_enabled: false,
          sso: {
            enabled: true,
            provider: 'entra',
            tenant_id: 'tenant',
            client_id: 'client',
            authority: 'https://login.microsoftonline.com/tenant',
            scopes: ['openid', 'profile', 'email'],
          },
          sso_error: null,
        });
      }),
    );

    renderLogin('/login?returnTo=%2Frisks');
    expect(await screen.findByRole('button', { name: 'login_sso.continue_with_microsoft' })).toBeInTheDocument();
  });

  it('calls Entra loginRedirect with returnTo on click', async () => {
    server.use(
      http.get('*/api/v1/auth/config', () => {
        return HttpResponse.json({
          auth_mode: 'microsoft_sso',
          demo_login_enabled: false,
          password_login_enabled: false,
          debug: false,
          mock_auth_enabled: false,
          sso: {
            enabled: true,
            provider: 'entra',
            tenant_id: 'tenant',
            client_id: 'client',
            authority: 'https://login.microsoftonline.com/tenant',
            scopes: ['openid', 'profile', 'email'],
          },
          sso_error: null,
        });
      }),
    );

    const user = userEvent.setup();
    renderLogin('/login?returnTo=%2Frisks');

    const button = await screen.findByRole('button', { name: 'login_sso.continue_with_microsoft' });
    await user.click(button);

    expect(entraAuth.loginRedirect).toHaveBeenCalledWith('/risks');
  });

  it('exchanges redirect id token, stores RiskHub JWT, and redirects', async () => {
    server.use(
      http.get('*/api/v1/auth/config', () => {
        return HttpResponse.json({
          auth_mode: 'microsoft_sso',
          demo_login_enabled: false,
          password_login_enabled: false,
          debug: false,
          mock_auth_enabled: false,
          sso: {
            enabled: true,
            provider: 'entra',
            tenant_id: 'tenant',
            client_id: 'client',
            authority: 'https://login.microsoftonline.com/tenant',
            scopes: ['openid', 'profile', 'email'],
          },
          sso_error: null,
        });
      }),
      http.post('*/api/v1/auth/sso/exchange', () => {
        return HttpResponse.json({
          access_token: 'exchanged-riskhub-token',
          token_type: 'bearer',
          user: {
            id: 1,
            email: 'user@example.com',
            name: 'User',
            role: 'employee',
            role_display_name: 'Employee',
            permissions: [],
            effective_permissions: [],
            access_scope: 'department',
            scope_label: 'department',
          },
        });
      }),
    );

    vi.mocked(entraAuth.handleRedirect).mockResolvedValue({
      idToken: 'id-token',
      state: '/controls',
    } as unknown as { idToken: string; state: string });

    const { hardNavigate } = await import('@/utils/hardNavigate');

    renderLogin('/auth/sso/callback');

    await waitFor(() => {
      expect(localStorage.getItem('access_token')).toBe('exchanged-riskhub-token');
      expect(hardNavigate).toHaveBeenCalledWith('/controls');
    });
  });
});
