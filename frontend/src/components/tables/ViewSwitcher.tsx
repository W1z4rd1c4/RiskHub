/**
 * ViewSwitcher - Tab-style view mode selector.
 */
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export type ViewMode = 'all' | 'category' | 'department' | 'process' | 'risk_type' | 'risk';

interface ViewSwitcherProps {
    value: ViewMode;
    onChange: (mode: ViewMode) => void;
    className?: string;
    exclude?: ViewMode[];
}

export function ViewSwitcher({ value, onChange, className, exclude = [] }: ViewSwitcherProps) {
    const { t } = useTranslation('common');

    const VIEW_OPTIONS = [
        { value: 'all' as ViewMode, label: t('views.all', 'All') },
        { value: 'category' as ViewMode, label: t('views.by_category', 'By Category') },
        { value: 'department' as ViewMode, label: t('views.by_department', 'By Department') },
        { value: 'process' as ViewMode, label: t('views.by_process', 'By Process') },
        { value: 'risk_type' as ViewMode, label: t('views.by_risk_type', 'By Risk Type') },
        { value: 'risk' as ViewMode, label: t('views.by_risk', 'By Risk') },
    ];

    const options = VIEW_OPTIONS.filter(opt => !exclude.includes(opt.value));

    return (
        <div className={cn('flex gap-1 p-1 glass rounded-xl', className)}>
            {options.map((option) => (
                <button
                    key={option.value}
                    onClick={() => {
                        if (option.value !== value) {
                            onChange(option.value);
                        }
                    }}
                    className={cn(
                        'px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200',
                        value === option.value
                            ? 'bg-accent text-white shadow-lg shadow-accent/20'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

