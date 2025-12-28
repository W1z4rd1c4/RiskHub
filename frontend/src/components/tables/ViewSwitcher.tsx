/**
 * ViewSwitcher - Tab-style view mode selector.
 */
import { cn } from '@/lib/utils';

export type ViewMode = 'all' | 'category' | 'department' | 'process';

interface ViewOption {
    value: ViewMode;
    label: string;
}

const VIEW_OPTIONS: ViewOption[] = [
    { value: 'all', label: 'All' },
    { value: 'category', label: 'By Category' },
    { value: 'department', label: 'By Department' },
    { value: 'process', label: 'By Process' },
];

interface ViewSwitcherProps {
    value: ViewMode;
    onChange: (mode: ViewMode) => void;
    className?: string;
}

export function ViewSwitcher({ value, onChange, className }: ViewSwitcherProps) {
    return (
        <div className={cn('flex gap-1 p-1 glass rounded-xl', className)}>
            {VIEW_OPTIONS.map((option) => (
                <button
                    key={option.value}
                    onClick={() => onChange(option.value)}
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
