import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    type ReactNode,
} from 'react';
import { useTranslation as useI18nextTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/AuthContext';
import { useLatestPreferenceSync, type PreferenceSyncStatus } from '@/hooks/useLatestPreferenceSync';
import {
    activateLanguage,
    normalizeSupportedLanguage,
    STORAGE_KEY,
    type SupportedLanguage,
} from '@/i18n';
import {
    markLanguageIntent,
    saveLanguageToServer,
} from '@/utils/userSettingsStorage';
import { logError } from '@/services/logger';

interface LanguageContextValue {
    language: SupportedLanguage;
    setLanguage: (language: SupportedLanguage) => void;
    syncStatus: PreferenceSyncStatus;
    retryLanguageSync: () => void;
    revertLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
    const { i18n } = useI18nextTranslation();
    const { isAuthenticated } = useAuth();
    const language = normalizeSupportedLanguage(i18n.language);
    const applyLanguage = useCallback(async (value: SupportedLanguage) => {
        await activateLanguage(i18n, value);
        localStorage.setItem(STORAGE_KEY, value);
    }, [i18n]);
    const {
        status: syncStatus,
        sync: syncLanguage,
        retry: retryLanguageSync,
        revert: revertLanguage,
        acknowledgeExternalValue,
    } = useLatestPreferenceSync({
        initialValue: language,
        save: saveLanguageToServer,
        applyLocal: applyLanguage,
        serializeLocalApplication: true,
    });

    useEffect(() => {
        const handleStorage = (event: StorageEvent) => {
            if (event.key === STORAGE_KEY && (event.newValue === 'en' || event.newValue === 'cs')) {
                acknowledgeExternalValue(event.newValue);
            }
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, [acknowledgeExternalValue]);

    const setLanguage = useCallback((newLanguage: SupportedLanguage) => {
        markLanguageIntent();
        if (isAuthenticated) {
            syncLanguage(newLanguage);
        } else {
            void applyLanguage(newLanguage).catch((error: unknown) => {
                logError('Changing the signed-out interface language failed.', error);
            });
        }
    }, [applyLanguage, isAuthenticated, syncLanguage]);

    const value = useMemo<LanguageContextValue>(() => ({
        language,
        setLanguage,
        syncStatus,
        retryLanguageSync,
        revertLanguage,
    }), [language, retryLanguageSync, revertLanguage, setLanguage, syncStatus]);

    return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguageContext(): LanguageContextValue {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
