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

export function getChartTooltipProps(
    chartTheme: ChartTheme,
    options: ChartTooltipOptions = {},
): ChartTooltipProps {
    const base: ChartTooltipProps = {
        contentStyle: {
            backgroundColor: chartTheme.tooltipBackground,
            border: `1px solid ${chartTheme.tooltipBorder}`,
            borderRadius: '8px',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 10px 20px -8px rgba(0, 0, 0, 0.45)',
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
            fontSize: '10px',
            fontWeight: 700,
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
