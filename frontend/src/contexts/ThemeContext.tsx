/**
 * Theme context with server sync and multi-tab support.
 */
import { createContext, useCallback, useContext, useState, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
    getLocalTheme,
    markThemeIntent,
    saveThemeToServer,
    THEME_KEY,
} from '@/utils/userSettingsStorage';
import { useLatestPreferenceSync, type PreferenceSyncStatus } from '@/hooks/useLatestPreferenceSync';

export type Theme = 'dark' | 'light' | 'riskhub';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    syncStatus: PreferenceSyncStatus;
    retryThemeSync: () => void;
    revertTheme: () => void;
}

const THEME_DOM: Record<Theme, { rootClass: string; colorScheme: 'light' | 'dark'; themeColor: string }> = {
    riskhub: { rootClass: 'theme-riskhub', colorScheme: 'dark', themeColor: '#0f172a' },
    dark: { rootClass: 'theme-dark', colorScheme: 'dark', themeColor: '#000000' },
    light: { rootClass: 'theme-light', colorScheme: 'light', themeColor: '#f8fafc' },
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const isValidTheme = (value: string | null): value is Theme =>
    value === 'light' || value === 'dark' || value === 'riskhub';

export function ThemeProvider({ children }: { children: ReactNode }) {
    const { isAuthenticated } = useAuth();

    const [theme, setThemeState] = useState<Theme>(() => {
        const stored = getLocalTheme();
        return isValidTheme(stored) ? stored : 'riskhub';
    });
    const applyTheme = useCallback((value: Theme) => {
        setThemeState(value);
        localStorage.setItem(THEME_KEY, value);
    }, []);
    const {
        status: syncStatus,
        sync: syncTheme,
        retry: retryThemeSync,
        revert: revertTheme,
        acknowledgeExternalValue,
    } = useLatestPreferenceSync({
        initialValue: theme,
        save: saveThemeToServer,
        applyLocal: applyTheme,
    });

    // Keep application tokens and native browser chrome on the same theme.
    useEffect(() => {
        const root = document.documentElement;
        const themeDom = THEME_DOM[theme];
        const themeColorMeta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

        root.classList.remove('theme-light', 'theme-dark', 'theme-riskhub');
        root.classList.add(themeDom.rootClass);
        root.style.colorScheme = themeDom.colorScheme;
        if (themeColorMeta) {
            themeColorMeta.content = themeDom.themeColor;
        }
    }, [theme]);

    // Listen for storage changes (multi-tab sync)
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === THEME_KEY && e.newValue && isValidTheme(e.newValue)) {
                setThemeState(e.newValue);
                acknowledgeExternalValue(e.newValue);
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [acknowledgeExternalValue]);

    // Re-read theme when auth state changes (login/logout triggers sync)
    useEffect(() => {
        const stored = getLocalTheme();
        if (isValidTheme(stored) && stored !== theme) {
            setThemeState(stored);
        }
    }, [isAuthenticated, theme]);

    const setTheme = (newTheme: Theme) => {
        markThemeIntent();
        if (isAuthenticated) {
            syncTheme(newTheme);
        } else {
            applyTheme(newTheme);
        }
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme, syncStatus, retryThemeSync, revertTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme(): ThemeContextType {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
