import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

type Theme = 'dark' | 'light' | 'riskhub';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'riskhub-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(() => {
        if (typeof window === 'undefined') return 'riskhub';
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark' || stored === 'riskhub') {
            return stored;
        }
        return 'riskhub'; // Default to RiskHub Theme
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

    const setTheme = (newTheme: Theme) => {
        localStorage.setItem(STORAGE_KEY, newTheme);
        setThemeState(newTheme);
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
