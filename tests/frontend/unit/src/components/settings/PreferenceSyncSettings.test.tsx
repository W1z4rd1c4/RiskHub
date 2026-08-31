import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';

import { AppearanceSettings } from '@/components/settings/AppearanceSettings';
import { LocalizationSettings } from '@/components/settings/LocalizationSettings';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import i18n, {
    createDynamicLocaleBackend,
    createRetryableLocaleLoader,
    namespaces,
} from '@/i18n';
import { resources as czechResources } from '@/i18n/locales/cs';
import { resources as englishResources } from '@/i18n/locales/en';

const { saveThemeMock, saveLanguageMock } = vi.hoisted(() => ({
    saveThemeMock: vi.fn(),
    saveLanguageMock: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock('@/utils/userSettingsStorage', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/utils/userSettingsStorage')>();
    return {
        ...actual,
        saveThemeToServer: (theme: string) => {
            localStorage.setItem('riskhub-theme', theme);
            return saveThemeMock(theme);
        },
        saveLanguageToServer: (language: string) => {
            localStorage.setItem('riskhub-language', language);
            return saveLanguageMock(language);
        },
    };
});

function deferred() {
    let resolve!: () => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<void>((settle, fail) => {
        resolve = settle;
        reject = fail;
    });
    return { promise, resolve, reject };
}

describe('account preference synchronization', () => {
    beforeEach(async () => {
        localStorage.clear();
        saveThemeMock.mockReset();
        saveLanguageMock.mockReset();
        await i18n.changeLanguage('en');
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await i18n.changeLanguage('en');
        localStorage.clear();
    });

    it('serializes rapid theme intent, keeps the latest visible choice, and reports Saved only after the latest write', async () => {
        const first = deferred();
        const second = deferred();
        saveThemeMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const user = userEvent.setup();

        render(
            <ThemeProvider>
                <AppearanceSettings />
            </ThemeProvider>,
        );

        await user.click(screen.getByTestId('theme-dark'));
        await user.click(screen.getByTestId('theme-light'));

        expect(screen.getByRole('radio', { name: /light/i })).toBeChecked();
        expect(saveThemeMock).toHaveBeenCalledTimes(1);
        expect(saveThemeMock).toHaveBeenNthCalledWith(1, 'dark');
        expect(screen.getByText('Saving')).toBeInTheDocument();

        await act(async () => first.resolve());
        await waitFor(() => expect(saveThemeMock).toHaveBeenNthCalledWith(2, 'light'));
        expect(screen.queryByText('Saved')).not.toBeInTheDocument();

        await act(async () => second.resolve());
        expect(await screen.findByText('Saved')).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: /light/i })).toBeChecked();
    });

    it('announces a failed theme write as Unsynced and supports Retry and Revert', async () => {
        saveThemeMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
        const user = userEvent.setup();

        render(
            <ThemeProvider>
                <AppearanceSettings />
            </ThemeProvider>,
        );

        await user.click(screen.getByTestId('theme-dark'));
        expect(await screen.findByText('Unsynced')).toBeInTheDocument();
        expect(screen.queryByText('Saved')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByText('Saved')).toBeInTheDocument();
        expect(saveThemeMock).toHaveBeenLastCalledWith('dark');

        saveThemeMock.mockRejectedValueOnce(new Error('offline again'));
        await user.click(screen.getByTestId('theme-light'));
        expect(await screen.findByText('Unsynced')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Revert' }));
        expect(screen.getByRole('radio', { name: /dark/i })).toBeChecked();
        expect(screen.queryByText('Unsynced')).not.toBeInTheDocument();
    });

    it('uses the same truthful latest-intent states for language in Czech', async () => {
        saveLanguageMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
        const user = userEvent.setup();

        render(
            <LanguageProvider>
                <LocalizationSettings />
            </LanguageProvider>,
        );
        await user.click(screen.getByTestId('language-cs'));

        expect(await screen.findByText('Nesynchronizováno')).toBeInTheDocument();
        expect(screen.getByText(/synchronizuje s vaším účtem/i)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Zkusit znovu' }));
        expect(await screen.findByText('Uloženo')).toBeInTheDocument();
        expect(saveLanguageMock).toHaveBeenLastCalledWith('cs');
    });

    it('normalizes a regional i18next language before exposing settings state', async () => {
        const instance = i18n.createInstance();
        await instance.init({
            lng: 'cs-CZ',
            fallbackLng: false,
            supportedLngs: ['en', 'cs'],
            nonExplicitSupportedLngs: true,
            defaultNS: 'settings',
            ns: namespaces,
            resources: {
                en: englishResources,
                cs: czechResources,
            },
            react: { useSuspense: false },
        });

        render(
            <I18nextProvider i18n={instance}>
                <LanguageProvider>
                    <LocalizationSettings />
                </LanguageProvider>
            </I18nextProvider>,
        );

        expect(instance.language).toBe('cs-CZ');
        expect(screen.getByTestId('language-cs')).toHaveClass('border-accent');
        expect(screen.getByText('Czech (Čeština)')).toBeInTheDocument();
        expect(screen.queryByText('English (English)')).not.toBeInTheDocument();
    });

    it('does not persist or report Saved when language activation fails, then retries activation before saving', async () => {
        localStorage.setItem('riskhub-language', 'en');
        const importCzech = vi.fn()
            .mockRejectedValueOnce(new Error('locale chunk unavailable'))
            .mockImplementationOnce(() => import('@/i18n/locales/cs'));
        const instance = i18n.createInstance();
        await instance
            .use(createDynamicLocaleBackend(createRetryableLocaleLoader({
                en: () => import('@/i18n/locales/en'),
                cs: importCzech,
            })))
            .init({
                lng: 'en',
                fallbackLng: false,
                supportedLngs: ['en', 'cs'],
                nonExplicitSupportedLngs: true,
                defaultNS: 'common',
                ns: namespaces,
                partialBundledLanguages: true,
                resources: { en: englishResources },
                react: { useSuspense: false },
            });
        const user = userEvent.setup();

        render(
            <I18nextProvider i18n={instance}>
                <LanguageProvider>
                    <LocalizationSettings />
                </LanguageProvider>
            </I18nextProvider>,
        );

        await user.click(screen.getByTestId('language-cs'));

        expect(await screen.findByText('Unsynced')).toBeInTheDocument();
        expect(screen.getByTestId('language-en')).toHaveClass('border-accent');
        expect(localStorage.getItem('riskhub-language')).toBe('en');
        expect(saveLanguageMock).not.toHaveBeenCalled();
        expect(screen.queryByText('Saved')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Retry' }));

        expect(await screen.findByText('Uloženo')).toBeInTheDocument();
        expect(importCzech).toHaveBeenCalledTimes(2);
        expect(saveLanguageMock).toHaveBeenCalledTimes(1);
        expect(saveLanguageMock).toHaveBeenLastCalledWith('cs');
        expect(localStorage.getItem('riskhub-language')).toBe('cs');
        expect(screen.getByTestId('language-cs')).toHaveClass('border-accent');
    });

    it('keeps one rapid language lane and preserves Unsynced actions across settings remounts', async () => {
        const first = deferred();
        const second = deferred();
        saveLanguageMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const user = userEvent.setup();
        const view = render(
            <LanguageProvider>
                <LocalizationSettings />
            </LanguageProvider>,
        );

        await user.click(screen.getByTestId('language-cs'));
        await user.click(screen.getByTestId('language-en'));
        expect(saveLanguageMock).toHaveBeenCalledTimes(1);
        expect(saveLanguageMock).toHaveBeenNthCalledWith(1, 'cs');

        await act(async () => first.resolve());
        await waitFor(() => expect(saveLanguageMock).toHaveBeenNthCalledWith(2, 'en'));
        await act(async () => second.reject(new Error('offline')));
        expect(await screen.findByText('Unsynced')).toBeInTheDocument();

        view.rerender(<LanguageProvider>{null}</LanguageProvider>);
        view.rerender(
            <LanguageProvider>
                <LocalizationSettings />
            </LanguageProvider>,
        );

        expect(await screen.findByText('Unsynced')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Revert' })).toBeInTheDocument();
    });
});
