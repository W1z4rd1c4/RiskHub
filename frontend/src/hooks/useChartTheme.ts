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
    /** Semantic line/area series colors */
    series: {
        primary: string;
        secondary: string;
        tertiary: string;
        warning: string;
        danger: string;
        success: string;
        neutral: string;
    };
    /** Threshold colors for min/max references */
    threshold: {
        min: string;
        max: string;
    };
    /** Severity palette for issue charts */
    issueSeverity: {
        low: string;
        medium: string;
        high: string;
        critical: string;
        fallback: string;
    };
    /** Domain palettes used by dashboard category charts */
    breakdown: {
        status: Record<string, string>;
        form: Record<string, string>;
        frequency: Record<string, string>;
    };
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
        series: {
            primary: '#1E84FF',
            secondary: '#F43F5E',
            tertiary: '#F97316',
            warning: '#F59E0B',
            danger: '#EF4444',
            success: '#10B981',
            neutral: '#64748B',
        },
        threshold: {
            min: '#F59E0B',
            max: '#EF4444',
        },
        issueSeverity: {
            low: '#22C55E',
            medium: '#F59E0B',
            high: '#F97316',
            critical: '#EF4444',
            fallback: '#64748B',
        },
        breakdown: {
            status: {
                active: '#10B981',
                inactive: '#6B7280',
                pending: '#F59E0B',
                deprecated: '#EF4444',
            },
            form: {
                preventive: '#3B82F6',
                detective: '#8B5CF6',
                corrective: '#F97316',
            },
            frequency: {
                daily: '#0D9488',
                weekly: '#14B8A6',
                monthly: '#2DD4BF',
                quarterly: '#5EEAD4',
                'semi-annually': '#67E8F9',
                annually: '#99F6E4',
                ad_hoc: '#6B7280',
                continuous: '#06B6D4',
            },
        },
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
        series: {
            primary: '#38BDF8',
            secondary: '#FB7185',
            tertiary: '#FB923C',
            warning: '#FBBF24',
            danger: '#FB7185',
            success: '#34D399',
            neutral: '#94A3B8',
        },
        threshold: {
            min: '#FBBF24',
            max: '#FB7185',
        },
        issueSeverity: {
            low: '#4ADE80',
            medium: '#FBBF24',
            high: '#FB923C',
            critical: '#FB7185',
            fallback: '#94A3B8',
        },
        breakdown: {
            status: {
                active: '#34D399',
                inactive: '#6B7280',
                pending: '#FBBF24',
                deprecated: '#FB7185',
            },
            form: {
                preventive: '#60A5FA',
                detective: '#A78BFA',
                corrective: '#FB923C',
            },
            frequency: {
                daily: '#2DD4BF',
                weekly: '#5EEAD4',
                monthly: '#67E8F9',
                quarterly: '#A5F3FC',
                'semi-annually': '#BAE6FD',
                annually: '#CCFBF1',
                ad_hoc: '#6B7280',
                continuous: '#22D3EE',
            },
        },
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
        series: {
            primary: '#1D4ED8',
            secondary: '#BE123C',
            tertiary: '#C2410C',
            warning: '#B45309',
            danger: '#DC2626',
            success: '#059669',
            neutral: '#475569',
        },
        threshold: {
            min: '#B45309',
            max: '#DC2626',
        },
        issueSeverity: {
            low: '#16A34A',
            medium: '#D97706',
            high: '#EA580C',
            critical: '#DC2626',
            fallback: '#64748B',
        },
        breakdown: {
            status: {
                active: '#059669',
                inactive: '#64748B',
                pending: '#D97706',
                deprecated: '#DC2626',
            },
            form: {
                preventive: '#2563EB',
                detective: '#7C3AED',
                corrective: '#EA580C',
            },
            frequency: {
                daily: '#0F766E',
                weekly: '#0D9488',
                monthly: '#14B8A6',
                quarterly: '#2DD4BF',
                'semi-annually': '#22D3EE',
                annually: '#5EEAD4',
                ad_hoc: '#64748B',
                continuous: '#0891B2',
            },
        },
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
