import i18n from 'i18next';
import type { i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

export const SUPPORTED_LANGUAGES = ['en', 'cs'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export const STORAGE_KEY = 'riskhub-language';

export const namespaces = [
    'common',
    'navigation',
    'dashboard',
    'risks',
    'controls',
    'kris',
    'approvals',
    'settings',
    'admin',
    'auth',
    'vendors',
    'processes',
    'assets',
    'threats',
    'ictRegisterDq',
    'ictRegisterCommittee',
    'issues',
    'errorKeys',
    'notifications',
    'layout',
    'evidence',
] as const;

export type Namespace = typeof namespaces[number];

const localeLoaders = {
    en: () => import('./locales/en'),
    cs: () => import('./locales/cs'),
};

type LocaleModule = Awaited<ReturnType<(typeof localeLoaders)['en']>>;

export function normalizeSupportedLanguage(language?: string | null): SupportedLanguage {
    const baseLanguage = language?.toLowerCase().split(/[-_]/)[0];
    return baseLanguage === 'cs' ? 'cs' : 'en';
}

function fallbackLanguages(language?: string): SupportedLanguage[] {
    if (!language) return ['en'];
    const baseLanguage = language.toLowerCase().split('-')[0];
    return SUPPORTED_LANGUAGES.includes(baseLanguage as SupportedLanguage) ? [] : ['en'];
}

export function createRetryableLocaleLoader<T>(
    loaders: Record<SupportedLanguage, () => Promise<T>>,
) {
    const promises = new Map<SupportedLanguage, Promise<T>>();

    return (language: string): Promise<T> => {
        const supportedLanguage = normalizeSupportedLanguage(language);
        const existing = promises.get(supportedLanguage);
        if (existing) return existing;

        const promise = loaders[supportedLanguage]();
        promises.set(supportedLanguage, promise);
        void promise.catch(() => {
            if (promises.get(supportedLanguage) === promise) {
                promises.delete(supportedLanguage);
            }
        });
        return promise;
    };
}

const loadLocale = createRetryableLocaleLoader<LocaleModule>(localeLoaders);

export function createDynamicLocaleBackend<T extends { resources: Record<string, unknown> }>(
    localeLoader: (language: string) => Promise<T>,
) {
    return {
        type: 'backend' as const,
        init: () => undefined,
        read: (
            language: string,
            namespace: string,
            callback: (error: Error | null, data?: Record<string, unknown>) => void,
        ) => {
            void localeLoader(language)
                .then(({ resources }) => {
                    callback(null, resources[namespace] as Record<string, unknown>);
                })
                .catch((error: unknown) => {
                    callback(error instanceof Error ? error : new Error('Locale loading failed'));
                });
        },
    };
}

function normalizeLocaleError(error: unknown): Error | null {
    if (!error || (Array.isArray(error) && error.length === 0)) return null;
    if (error instanceof Error) return error;
    if (Array.isArray(error)) {
        return error.find((item): item is Error => item instanceof Error)
            ?? new Error(error.map(String).join(', '));
    }
    return new Error(String(error));
}

function waitForI18nextCallback(
    start: (callback: (error: unknown) => void) => Promise<unknown>,
): Promise<void> {
    return new Promise((resolve, reject) => {
        let settled = false;
        const settle = (error?: unknown) => {
            if (settled) return;
            settled = true;
            const normalizedError = normalizeLocaleError(error);
            if (normalizedError) reject(normalizedError);
            else resolve();
        };

        try {
            void start(settle).catch(settle);
        } catch (error) {
            settle(error);
        }
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function activateLanguage(
    instance: Pick<I18nInstance, 'loadLanguages' | 'changeLanguage' | 'options' | 'services'>,
    language: SupportedLanguage,
    signal?: AbortSignal,
): Promise<void> {
    signal?.throwIfAborted();
    const backendConnector: unknown = instance.services.backendConnector;
    const failedLoads: Record<string, unknown> =
        isRecord(backendConnector) && isRecord(backendConnector.state)
            ? backendConnector.state
            : {};
    let hadFailedLoad = false;
    for (const [key, status] of Object.entries(failedLoads)) {
        if (key.startsWith(`${language}|`) && typeof status === 'number' && status < 0) {
            failedLoads[key] = 0;
            hadFailedLoad = true;
        }
    }
    if (hadFailedLoad && Array.isArray(instance.options.preload)) {
        instance.options.preload = instance.options.preload.filter((item) => item !== language);
    }
    await waitForI18nextCallback((callback) => instance.loadLanguages(language, callback));
    signal?.throwIfAborted();
    await waitForI18nextCallback((callback) => instance.changeLanguage(language, callback));
    signal?.throwIfAborted();
}

const dynamicLocaleBackend = createDynamicLocaleBackend(loadLocale);

await i18n
    .use(LanguageDetector)
    .use(dynamicLocaleBackend)
    .use(initReactI18next)
    .init({
        fallbackLng: fallbackLanguages,
        supportedLngs: SUPPORTED_LANGUAGES,
        nonExplicitSupportedLngs: true,
        defaultNS: 'common',
        ns: namespaces,
        detection: {
            order: ['localStorage', 'navigator', 'htmlTag'],
            lookupLocalStorage: STORAGE_KEY,
            caches: ['localStorage'],
        },
        interpolation: {
            escapeValue: false,
        },
        debug: import.meta.env.DEV && import.meta.env.MODE !== 'test',
        react: {
            useSuspense: false,
        },
    });

export default i18n;
