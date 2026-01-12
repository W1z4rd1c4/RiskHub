/**
 * useChartTheme - Provides theme-aware colors for Recharts components.
 * 
 * Returns colors that adapt to the current theme (RiskHub, Dark, Light)
 * for consistent chart styling across the application.
 */
import { useMemo } from 'react';
import { useTheme, type Theme } from '@/contexts/ThemeContext';

export interface ChartTheme {
    /** Background color for chart tooltips */
    tooltipBackground: string;
    /** Border color for chart tooltips */
    tooltipBorder: string;
    /** Primary text color in tooltips (values) */
    tooltipTextPrimary: string;
    /** Secondary text color in tooltips (labels) */
    tooltipTextSecondary: string;
    /** CartesianGrid stroke color */
    gridStroke: string;
    /** XAxis/YAxis tick text color */
    axisTickFill: string;
    /** Active dot fill color (matches background for hollow effect) */
    activeDotFill: string;
    /** Tooltip cursor line color */
    cursorStroke: string;
}

const THEME_COLORS: Record<Theme, ChartTheme> = {
    // RiskHub (default) - Dark blue-gray
    riskhub: {
        tooltipBackground: 'rgba(15, 23, 42, 0.95)',
        tooltipBorder: 'rgba(255, 255, 255, 0.1)',
        tooltipTextPrimary: '#ffffff',
        tooltipTextSecondary: '#94a3b8',
        gridStroke: 'rgba(255, 255, 255, 0.05)',
        axisTickFill: '#94a3b8',
        activeDotFill: '#0F172A',
        cursorStroke: '#334155',
    },
    // Dark (OLED) - Pure black
    dark: {
        tooltipBackground: 'rgba(10, 10, 10, 0.98)',
        tooltipBorder: 'rgba(255, 255, 255, 0.12)',
        tooltipTextPrimary: '#f1f1f1',
        tooltipTextSecondary: '#a1a1a1',
        gridStroke: 'rgba(255, 255, 255, 0.04)',
        axisTickFill: '#a1a1a1',
        activeDotFill: '#000000',
        cursorStroke: '#333333',
    },
    // Light - White/light gray
    light: {
        tooltipBackground: 'rgba(255, 255, 255, 0.98)',
        tooltipBorder: 'rgba(0, 0, 0, 0.1)',
        tooltipTextPrimary: '#1e293b',
        tooltipTextSecondary: '#64748b',
        gridStroke: 'rgba(0, 0, 0, 0.06)',
        axisTickFill: '#64748b',
        activeDotFill: '#f8fafc',
        cursorStroke: '#cbd5e1',
    },
};

/**
 * Hook to get theme-aware colors for Recharts components.
 * 
 * @example
 * ```tsx
 * const chartTheme = useChartTheme();
 * 
 * <Tooltip
 *   contentStyle={{
 *     backgroundColor: chartTheme.tooltipBackground,
 *     border: `1px solid ${chartTheme.tooltipBorder}`,
 *   }}
 *   itemStyle={{ color: chartTheme.tooltipTextPrimary }}
 * />
 * ```
 */
export function useChartTheme(): ChartTheme {
    const { theme } = useTheme();

    return useMemo(() => THEME_COLORS[theme], [theme]);
}
