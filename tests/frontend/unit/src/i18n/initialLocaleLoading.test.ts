describe('initial locale loading', () => {
    it('initializes the Vitest singleton without scheduling locale chunk loads', async () => {
        localStorage.setItem('riskhub-language', 'en');
        vi.resetModules();

        const { default: i18n } = await import('@/i18n');

        expect(i18n.hasResourceBundle('en', 'common')).toBe(true);
        expect(i18n.hasResourceBundle('cs', 'common')).toBe(true);
    });

    it('asks the configured backend for Czech only when Czech is detected', async () => {
        localStorage.setItem('riskhub-language', 'cs');
        vi.resetModules();

        const { default: i18n } = await import('@/i18n');
        const requestedLanguages: string[] = [];
        const backend = i18n.services.backendConnector.backend as {
            read: (
                language: string,
                namespace: string,
                callback: (error: Error | null, data?: Record<string, unknown>) => void,
            ) => void;
        };

        const hierarchy = i18n.services.languageUtils.toResolveHierarchy('cs');
        await Promise.all(hierarchy.map((language) => new Promise<void>((resolve, reject) => {
            requestedLanguages.push(language);
            backend.read(language, 'common', (error) => {
                if (error) reject(error);
                else resolve();
            });
        })));

        expect(requestedLanguages).toEqual(['cs']);
        expect(i18n.services.languageUtils.toResolveHierarchy('en')).toEqual(['en']);
        expect(i18n.services.languageUtils.toResolveHierarchy('de')).toEqual(['en']);
    });

    it('evicts a rejected locale import so the next activation invokes a fresh loader', async () => {
        localStorage.setItem('riskhub-language', 'en');
        vi.resetModules();

        const { createRetryableLocaleLoader } = await import('@/i18n');
        const czechResources = { resources: { common: { ready: 'Ano' } } };
        const importCzech = vi.fn()
            .mockRejectedValueOnce(new Error('chunk download failed'))
            .mockResolvedValueOnce(czechResources);
        const loadLocale = createRetryableLocaleLoader({
            en: vi.fn().mockResolvedValue({ resources: { common: { ready: 'Yes' } } }),
            cs: importCzech,
        });

        await expect(loadLocale('cs')).rejects.toThrow('chunk download failed');
        await expect(loadLocale('cs')).resolves.toBe(czechResources);
        expect(importCzech).toHaveBeenCalledTimes(2);
    });

    it('turns real i18next backend callback errors into retryable activation failures', async () => {
        localStorage.setItem('riskhub-language', 'en');
        vi.resetModules();

        const {
            activateLanguage,
            createDynamicLocaleBackend,
            createRetryableLocaleLoader,
            default: i18n,
        } = await import('@/i18n');
        const localeError = new Error('chunk download failed');
        const czechResources = { resources: { common: { ready: 'Ano' } } };
        const importCzech = vi.fn()
            .mockRejectedValueOnce(localeError)
            .mockRejectedValueOnce(localeError)
            .mockResolvedValueOnce(czechResources);
        const loadLocale = createRetryableLocaleLoader({
            en: vi.fn().mockResolvedValue({ resources: { common: { ready: 'Yes' } } }),
            cs: importCzech,
        });
        const instance = i18n.createInstance();
        await instance
            .use(createDynamicLocaleBackend(loadLocale))
            .init({
                lng: 'en',
                fallbackLng: false,
                supportedLngs: ['en', 'cs'],
                defaultNS: 'common',
                ns: ['common'],
                partialBundledLanguages: true,
                resources: { en: { common: { ready: 'Yes' } } },
            });

        let nativeCallbackError: unknown;
        await expect(instance.loadLanguages('cs', (error) => {
            nativeCallbackError = error;
        })).resolves.toBeUndefined();
        expect(nativeCallbackError).toEqual(expect.arrayContaining([localeError]));
        expect(instance.language).toBe('en');

        await expect(activateLanguage(instance, 'cs')).rejects.toThrow('chunk download failed');
        expect(instance.language).toBe('en');
        expect(instance.hasResourceBundle('cs', 'common')).toBe(false);

        await expect(activateLanguage(instance, 'cs')).resolves.toBeUndefined();
        expect(instance.language).toBe('cs');
        expect(instance.t('ready')).toBe('Ano');
        expect(importCzech).toHaveBeenCalledTimes(3);
    });
});
