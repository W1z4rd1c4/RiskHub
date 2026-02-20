import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { clearAccessToken, setAccessToken } from '@/services/accessTokenStore';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

const getCurrentUserMock = vi.fn();
const syncPreferencesFromServerMock = vi.fn();
const clearLocalSettingsMock = vi.fn();

vi.mock('@/services/authApi', () => ({
  authApi: {
    login: vi.fn(),
    getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
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
    window.__RISKHUB_PREFERENCES_READY__ = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    clearAccessToken();
    window.__RISKHUB_PREFERENCES_READY__ = undefined;
  });

  it('does not mark auth ready until preferences are synced from server', async () => {
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
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(getCurrentUserMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('auth-loading')).toHaveTextContent('loading');
    expect(screen.getByTestId('prefs-hydrated')).toHaveTextContent('no');
    expect(window.__RISKHUB_PREFERENCES_READY__).toBe(false);

    deferred.resolve({ theme: 'dark', language: 'cs' });

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('ready');
      expect(screen.getByTestId('prefs-hydrated')).toHaveTextContent('yes');
    });
    expect(window.__RISKHUB_PREFERENCES_READY__).toBe(true);
  });
});
