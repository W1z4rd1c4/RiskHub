import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider, useLanguageContext } from '@/contexts/LanguageContext';
import i18n from '@/i18n';

function LanguageProbe() {
    const { language } = useLanguageContext();
    return <span data-testid="language">{language}</span>;
}

describe('LanguageProvider <html lang> contract (AX-09)', () => {
    beforeEach(async () => {
        localStorage.clear();
        document.documentElement.lang = 'en';
        await i18n.changeLanguage('en');
    });

    afterEach(async () => {
        await i18n.changeLanguage('en');
        document.documentElement.lang = 'en';
    });

    it('keeps the document language in sync with the in-app language on every change', async () => {
        render(
            <AuthProvider>
                <LanguageProvider>
                    <LanguageProbe />
                </LanguageProvider>
            </AuthProvider>,
        );

        await waitFor(() => expect(document.documentElement.lang).toBe('en'));

        await act(async () => {
            await i18n.changeLanguage('cs');
        });
        await waitFor(() => expect(screen.getByTestId('language')).toHaveTextContent('cs'));
        expect(document.documentElement.lang).toBe('cs');

        await act(async () => {
            await i18n.changeLanguage('en');
        });
        await waitFor(() => expect(document.documentElement.lang).toBe('en'));
    });

    it('normalizes a regional i18n language to the supported document language', async () => {
        document.documentElement.lang = '';
        render(
            <AuthProvider>
                <LanguageProvider>
                    <LanguageProbe />
                </LanguageProvider>
            </AuthProvider>,
        );

        await act(async () => {
            await i18n.changeLanguage('cs-CZ');
        });
        await waitFor(() => expect(document.documentElement.lang).toBe('cs'));
    });
});
