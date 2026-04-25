import { ThemedSelect } from '@/components/ui/ThemedSelect';

import type { QuarterOption } from './quarterlyComparisonPresentation';

interface QuarterPeriodSelectorProps {
    compareQuarter: number | null;
    compareQuarterOptions: QuarterOption[];
    compareYear: number | null;
    currentQuarter: number | null;
    currentQuarterOptions: QuarterOption[];
    currentYear: number | null;
    onCompareQuarterChange: (value: number) => void;
    onCompareYearChange: (value: number) => void;
    onCurrentQuarterChange: (value: number) => void;
    onCurrentYearChange: (value: number) => void;
    t: (key: string) => string;
    yearOptions: QuarterOption[];
}

export function QuarterPeriodSelector({
    compareQuarter,
    compareQuarterOptions,
    compareYear,
    currentQuarter,
    currentQuarterOptions,
    currentYear,
    onCompareQuarterChange,
    onCompareYearChange,
    onCurrentQuarterChange,
    onCurrentYearChange,
    t,
    yearOptions,
}: QuarterPeriodSelectorProps) {
    return (
        <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b border-white/5">
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {t('quarterly.current_period')}
                </span>
                <ThemedSelect
                    value={currentQuarter?.toString() ?? '1'}
                    onValueChange={(value) => onCurrentQuarterChange(Number.parseInt(value, 10))}
                    options={currentQuarterOptions}
                    className="min-w-[70px]"
                    triggerTestId="quarterly-current-quarter"
                    optionTestIdPrefix="quarterly-current-quarter-option"
                />
                <ThemedSelect
                    value={currentYear?.toString() ?? ''}
                    onValueChange={(value) => onCurrentYearChange(Number.parseInt(value, 10))}
                    options={yearOptions}
                    className="min-w-[90px]"
                    triggerTestId="quarterly-current-year"
                    optionTestIdPrefix="quarterly-current-year-option"
                />
            </div>

            <span className="text-xs text-slate-600 font-bold">{t('quarterly.vs')}</span>

            <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {t('quarterly.compare_period')}
                </span>
                <ThemedSelect
                    value={compareQuarter?.toString() ?? '4'}
                    onValueChange={(value) => onCompareQuarterChange(Number.parseInt(value, 10))}
                    options={compareQuarterOptions}
                    className="min-w-[70px]"
                    triggerTestId="quarterly-compare-quarter"
                    optionTestIdPrefix="quarterly-compare-quarter-option"
                />
                <ThemedSelect
                    value={compareYear?.toString() ?? ''}
                    onValueChange={(value) => onCompareYearChange(Number.parseInt(value, 10))}
                    options={yearOptions}
                    className="min-w-[90px]"
                    triggerTestId="quarterly-compare-year"
                    optionTestIdPrefix="quarterly-compare-year-option"
                />
            </div>
        </div>
    );
}
