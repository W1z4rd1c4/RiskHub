import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import { preferencesApi } from '@/services/preferencesApi';
import {
    getLocalLanguage,
    getLocalTheme,
    saveLanguageToServer,
    saveThemeToServer,
    syncPreferencesFromServer,
} from '@/utils/userSettingsStorage';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((settle) => {
        resolve = settle;
    });
    return { promise, resolve };
}

describe('preference hydration intent ordering', () => {
    beforeEach(async () => {
        localStorage.clear();
        vi.restoreAllMocks();
        await i18n.changeLanguage('en');
    });

    it('does not let late server hydration replace newer theme or language intent', async () => {
        const hydration = deferred<{ theme: 'dark'; language: 'en' }>();
        vi.spyOn(preferencesApi, 'get').mockReturnValueOnce(hydration.promise);
        vi.spyOn(preferencesApi, 'update').mockResolvedValue({ theme: 'light', language: 'cs' });

        const hydrationPromise = syncPreferencesFromServer();
        await saveThemeToServer('light');
        await i18n.changeLanguage('cs');
        await saveLanguageToServer('cs');

        hydration.resolve({ theme: 'dark', language: 'en' });
        await hydrationPromise;

        expect(getLocalTheme()).toBe('light');
        expect(getLocalLanguage()).toBe('cs');
        expect(i18n.language).toBe('cs');
    });
});
