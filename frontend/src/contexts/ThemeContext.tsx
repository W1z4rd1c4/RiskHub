/**
 * Theme context with server sync and multi-tab support.
 */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getLocalTheme, saveThemeToServer, THEME_KEY } from '@/utils/userSettingsStorage';
import { logError } from '@/services/logger';

export type Theme = 'dark' | 'light' | 'riskhub';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const isValidTheme = (value: string | null): value is Theme =>
    value === 'light' || value === 'dark' || value === 'riskhub';

export function ThemeProvider({ children }: { children: ReactNode }) {
    const { isAuthenticated } = useAuth();

    const [theme, setThemeState] = useState<Theme>(() => {
        const stored = getLocalTheme();
        return isValidTheme(stored) ? stored : 'riskhub';
    });

    // Apply theme class to document
    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove('theme-light', 'theme-dark', 'theme-riskhub');
        if (theme === 'light') {
            root.classList.add('theme-light');
        } else if (theme === 'dark') {
            root.classList.add('theme-dark');
        }
        // riskhub is default, no class needed (uses :root variables)
    }, [theme]);

    // Listen for storage changes (multi-tab sync)
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === THEME_KEY && e.newValue && isValidTheme(e.newValue)) {
                setThemeState(e.newValue);
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    // Re-read theme when auth state changes (login/logout triggers sync)
    useEffect(() => {
        const stored = getLocalTheme();
        if (isValidTheme(stored) && stored !== theme) {
            setThemeState(stored);
        }
    }, [isAuthenticated, theme]);

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
        if (isAuthenticated) {
            saveThemeToServer(newTheme).catch((error: unknown) => {
                logError('Failed to save theme preference.', error);
            });
        } else {
            // Guest mode: just save locally
            localStorage.setItem(THEME_KEY, newTheme);
        }
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
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
