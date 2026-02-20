import { describe, expect, it } from 'vitest';
import type { ChartTheme } from '@/hooks/useChartTheme';
import { getChartTooltipProps } from '@/components/dashboard/chartTooltip';

const theme: ChartTheme = {
    tooltipBackground: 'rgba(15, 23, 42, 0.95)',
    tooltipBorder: 'rgba(255, 255, 255, 0.1)',
    tooltipTextPrimary: '#ffffff',
    tooltipTextSecondary: '#94a3b8',
    gridStroke: 'rgba(255, 255, 255, 0.05)',
    axisTickFill: '#94a3b8',
    activeDotFill: '#0F172A',
    cursorStroke: '#334155',
};

describe('getChartTooltipProps', () => {
    it('returns theme-aware readable defaults with unclipped tooltip behavior', () => {
        const props = getChartTooltipProps(theme);

        expect(props.itemStyle.color).toBe(theme.tooltipTextPrimary);
        expect(props.labelStyle.color).toBe(theme.tooltipTextSecondary);
        expect(props.allowEscapeViewBox).toEqual({ x: true, y: true });
        expect(props.offset).toBe(12);
        expect(props.wrapperStyle.pointerEvents).toBe('none');
    });

    it('merges overrides while preserving defaults', () => {
        const props = getChartTooltipProps(theme, {
            contentStyle: { borderRadius: '12px' },
            labelStyle: { marginBottom: '8px' },
            offset: 16,
        });

        expect(props.contentStyle.backgroundColor).toBe(theme.tooltipBackground);
        expect(props.contentStyle.borderRadius).toBe('12px');
        expect(props.labelStyle.marginBottom).toBe('8px');
        expect(props.itemStyle.color).toBe(theme.tooltipTextPrimary);
        expect(props.offset).toBe(16);
    });
});
