import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import English namespace files
import commonEN from './locales/en/common.json';
import navigationEN from './locales/en/navigation.json';
import dashboardEN from './locales/en/dashboard.json';
import risksEN from './locales/en/risks.json';
import controlsEN from './locales/en/controls.json';
import krisEN from './locales/en/kris.json';
import approvalsEN from './locales/en/approvals.json';
import settingsEN from './locales/en/settings.json';
import adminEN from './locales/en/admin.json';
import authEN from './locales/en/auth.json';
import vendorsEN from './locales/en/vendors.json';

// Import Czech namespace files
import commonCS from './locales/cs/common.json';
import navigationCS from './locales/cs/navigation.json';
import dashboardCS from './locales/cs/dashboard.json';
import risksCS from './locales/cs/risks.json';
import controlsCS from './locales/cs/controls.json';
import krisCS from './locales/cs/kris.json';
import approvalsCS from './locales/cs/approvals.json';
import settingsCS from './locales/cs/settings.json';
import adminCS from './locales/cs/admin.json';
import authCS from './locales/cs/auth.json';
import vendorsCS from './locales/cs/vendors.json';

export const SUPPORTED_LANGUAGES = ['en', 'cs'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export const STORAGE_KEY = 'riskhub-language';

export const resources = {
    en: {
        common: commonEN,
        navigation: navigationEN,
        dashboard: dashboardEN,
        risks: risksEN,
        controls: controlsEN,
        kris: krisEN,
        approvals: approvalsEN,
        settings: settingsEN,
        admin: adminEN,
        auth: authEN,
        vendors: vendorsEN,
    },
    cs: {
        common: commonCS,
        navigation: navigationCS,
        dashboard: dashboardCS,
        risks: risksCS,
        controls: controlsCS,
        kris: krisCS,
        approvals: approvalsCS,
        settings: settingsCS,
        admin: adminCS,
        auth: authCS,
        vendors: vendorsCS,
    },
} as const;

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
] as const;

export type Namespace = typeof namespaces[number];

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: 'en',
        defaultNS: 'common',
        ns: namespaces,

        // Language detection settings
        detection: {
            // Order of language detection
            order: ['localStorage', 'navigator', 'htmlTag'],
            // Key used in localStorage
            lookupLocalStorage: STORAGE_KEY,
            // Cache user language preference
            caches: ['localStorage'],
        },

        interpolation: {
            escapeValue: false, // React already escapes values
        },

        // Enable debug mode in development (but keep tests quiet)
        debug: import.meta.env.DEV && import.meta.env.MODE !== 'test',

        // Don't wait for translations to load (they're bundled)
        react: {
            useSuspense: false,
        },
    });

export default i18n;
