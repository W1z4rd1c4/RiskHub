import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { clearAccessToken, setAccessToken } from '@test/accessTokenStoreHarness';
import { ProtectedRoute } from '@/App';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

const getCurrentUserMock = vi.fn();
const syncPreferencesFromServerMock = vi.fn();
const clearLocalSettingsMock = vi.fn();

vi.mock('@/services/authApi', () => ({
  authApi: {
    login: vi.fn(),
    getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
    getAuthConfig: vi.fn(async () => ({
      auth_mode: 'hybrid_dev',
      demo_login_enabled: true,
      password_login_enabled: true,
      strict_capabilities: false,
      sso: {
        enabled: false,
        provider: 'entra',
        scopes: [],
      },
    })),
  },
}));

vi.mock('@/utils/userSettingsStorage', () => ({
  syncPreferencesFromServer: (...args: unknown[]) => syncPreferencesFromServerMock(...args),
  clearLocalSettings: (...args: unknown[]) => clearLocalSettingsMock(...args),
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function Probe() {
  const { isLoading, isPreferencesHydrated } = useAuth();
  return (
    <div>
      <span data-testid="auth-loading">{isLoading ? 'loading' : 'ready'}</span>
      <span data-testid="prefs-hydrated">{isPreferencesHydrated ? 'yes' : 'no'}</span>
    </div>
  );
}

describe('Auth preference hydration ordering', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAccessToken();
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    clearAccessToken();
  });

  it('renders a protected route as soon as identity is known while preferences hydrate in the background', async () => {
    setAccessToken('fake-token');

    getCurrentUserMock.mockResolvedValueOnce({
      id: 1,
      email: 'anna@riskhub.local',
      name: 'Anna Kowalski',
      role: 'chief_risk_officer',
      role_display_name: 'Chief Risk Officer',
      permissions: [],
      effective_permissions: [],
      access_scope: 'global',
      scope_label: 'Global',
    });

    const deferred = createDeferred<{ theme: 'dark' | 'light' | 'riskhub'; language: 'en' | 'cs' }>();
    syncPreferencesFromServerMock.mockReturnValueOnce(deferred.promise);

    render(
      <AuthProvider>
        <MemoryRouter>
          <Probe />
          <ProtectedRoute>
            <div>protected route ready</div>
          </ProtectedRoute>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() => expect(getCurrentUserMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('auth-loading')).toHaveTextContent('ready'));
    expect(screen.getByTestId('prefs-hydrated')).toHaveTextContent('no');
    expect(screen.getByText('protected route ready')).toBeInTheDocument();

    deferred.resolve({ theme: 'dark', language: 'cs' });

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('ready');
      expect(screen.getByTestId('prefs-hydrated')).toHaveTextContent('yes');
    });
  });
});
