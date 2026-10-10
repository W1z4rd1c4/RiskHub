import type { CSSProperties } from 'react';
import type { ChartTheme } from '@/hooks/useChartTheme';

export interface ChartTooltipOptions {
    contentStyle?: CSSProperties;
    itemStyle?: CSSProperties;
    labelStyle?: CSSProperties;
    wrapperStyle?: CSSProperties;
    allowEscapeViewBox?: { x: boolean; y: boolean };
    offset?: number;
}

export interface ChartTooltipProps {
    contentStyle: CSSProperties;
    itemStyle: CSSProperties;
    labelStyle: CSSProperties;
    wrapperStyle: CSSProperties;
    allowEscapeViewBox: { x: boolean; y: boolean };
    offset: number;
}

type TooltipTheme = Pick<
    ChartTheme,
    'tooltipBackground' | 'tooltipBorder' | 'tooltipTextPrimary' | 'tooltipTextSecondary'
>;

export function getChartTooltipProps(
    chartTheme: TooltipTheme,
    options: ChartTooltipOptions = {},
): ChartTooltipProps {
    const base: ChartTooltipProps = {
        contentStyle: {
            backgroundColor: chartTheme.tooltipBackground,
            border: `1px solid ${chartTheme.tooltipBorder}`,
            borderRadius: '8px',
            backdropFilter: 'blur(8px)',
            // The popover elevation token (per theme in index.css), not a raw rgba.
            boxShadow: 'var(--popover-shadow)',
            padding: '10px 12px',
        },
        itemStyle: {
            color: chartTheme.tooltipTextPrimary,
            fontSize: '12px',
            fontWeight: 600,
            padding: '2px 0',
        },
        labelStyle: {
            color: chartTheme.tooltipTextSecondary,
            // D6: 11px is the type floor (the eyebrow size).
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: '6px',
            display: 'block',
        },
        wrapperStyle: {
            pointerEvents: 'none',
            zIndex: 1000,
        },
        allowEscapeViewBox: { x: true, y: true },
        offset: 12,
    };

    return {
        ...base,
        ...options,
        contentStyle: { ...base.contentStyle, ...options.contentStyle },
        itemStyle: { ...base.itemStyle, ...options.itemStyle },
        labelStyle: { ...base.labelStyle, ...options.labelStyle },
        wrapperStyle: { ...base.wrapperStyle, ...options.wrapperStyle },
        allowEscapeViewBox: options.allowEscapeViewBox ?? base.allowEscapeViewBox,
        offset: options.offset ?? base.offset,
    };
}
