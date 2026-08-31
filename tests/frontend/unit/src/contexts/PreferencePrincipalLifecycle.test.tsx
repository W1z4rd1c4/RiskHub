import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppearanceSettings } from '@/components/settings/AppearanceSettings';
import { PrincipalQueryBoundary } from '@/contexts/PrincipalQueryBoundary';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { preferencesApi, type UserPreferences } from '@/services/preferencesApi';
import { syncPreferencesFromServer } from '@/utils/userSettingsStorage';

vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({ isAuthenticated: true }),
}));

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((settle, fail) => {
        resolve = settle;
        reject = fail;
    });
    return { promise, resolve, reject };
}

function PreferencesView({ principalId }: { principalId: number }) {
    return (
        <PrincipalQueryBoundary principalId={principalId}>
            <ThemeProvider>
                <AppearanceSettings />
            </ThemeProvider>
        </PrincipalQueryBoundary>
    );
}

describe('principal-owned preference synchronization', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('aborts User A work and never starts queued User A intent after User B takes ownership', async () => {
        const activeWrite = deferred<UserPreferences>();
        let activeSignal: AbortSignal | undefined;
        vi.spyOn(preferencesApi, 'update').mockImplementation((
            _preferences,
            options?: { signal?: AbortSignal },
        ) => {
            activeSignal = options?.signal;
            return activeWrite.promise;
        });
        const user = userEvent.setup();
        const view = render(<PreferencesView principalId={1} />);

        await user.click(screen.getByTestId('theme-dark'));
        await user.click(screen.getByTestId('theme-light'));
        expect(preferencesApi.update).toHaveBeenCalledTimes(1);

        view.rerender(<PreferencesView principalId={2} />);

        expect(activeSignal).toBeInstanceOf(AbortSignal);
        expect(activeSignal?.aborted).toBe(true);
        await act(async () => activeWrite.reject(new DOMException('cancelled', 'AbortError')));
        await Promise.resolve();
        expect(preferencesApi.update).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('Unsynced')).not.toBeInTheDocument();
    });

    it('keeps queued intent B visible and eventually saved when late hydration resolves behind write A', async () => {
        const hydration = deferred<UserPreferences>();
        const writeA = deferred<UserPreferences>();
        const writeB = deferred<UserPreferences>();
        vi.spyOn(preferencesApi, 'get').mockReturnValueOnce(hydration.promise);
        vi.spyOn(preferencesApi, 'update')
            .mockReturnValueOnce(writeA.promise)
            .mockReturnValueOnce(writeB.promise);
        const user = userEvent.setup();
        render(<PreferencesView principalId={1} />);

        await user.click(screen.getByTestId('theme-dark'));
        const hydrationPromise = syncPreferencesFromServer();
        await user.click(screen.getByTestId('theme-light'));
        expect(preferencesApi.update).toHaveBeenCalledTimes(1);

        hydration.resolve({ theme: 'riskhub', language: 'en' });
        await hydrationPromise;
        expect(screen.getByRole('radio', { name: /light/i })).toBeChecked();
        expect(localStorage.getItem('riskhub-theme')).toBe('light');

        await act(async () => writeA.resolve({ theme: 'dark', language: 'en' }));
        await waitFor(() => expect(preferencesApi.update).toHaveBeenCalledTimes(2));
        await act(async () => writeB.resolve({ theme: 'light', language: 'en' }));

        expect(await screen.findByText('Saved')).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: /light/i })).toBeChecked();
        expect(localStorage.getItem('riskhub-theme')).toBe('light');
    });
});
