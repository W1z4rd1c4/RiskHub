import type { ReactNode } from 'react';
import { Filter, RefreshCw, Search, X } from 'lucide-react';

interface RegisterFilterOption {
    value: string;
    label: string;
}

export interface RegisterFilterChip {
    key: string;
    label: string;
}

interface RegisterListToolbarProps {
    activeFilterCount: number;
    availableFilters: RegisterFilterOption[];
    chips: RegisterFilterChip[];
    children?: ReactNode;
    clearAllLabel: string;
    filterCountLabel: string;
    filtersLabel: string;
    isLoading: boolean;
    lifecycleControl: ReactNode;
    onAddFilter: (key: string) => void;
    onClearAll: () => void;
    onRefresh: () => void;
    onRemoveFilter: (key: string) => void;
    removeFilterLabel: (chipLabel: string) => string;
    onSearchChange: (value: string) => void;
    refreshLabel: string;
    search: string;
    searchPlaceholder: string;
    testIdPrefix: string;
}

export function RegisterListToolbar({
    activeFilterCount,
    availableFilters,
    chips,
    children,
    clearAllLabel,
    filterCountLabel,
    filtersLabel,
    isLoading,
    lifecycleControl,
    onAddFilter,
    onClearAll,
    onRefresh,
    onRemoveFilter,
    onSearchChange,
    refreshLabel,
    removeFilterLabel,
    search,
    searchPlaceholder,
    testIdPrefix,
}: RegisterListToolbarProps) {
    return (
        <section className="glass-card space-y-4" aria-label={filtersLabel}>
            <div className="flex flex-col lg:flex-row gap-4">
                <label className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all">
                    <Search className="h-4 w-4 text-slate-500" aria-hidden="true" />
                    <span className="sr-only">{searchPlaceholder}</span>
                    <input
                        data-testid={`${testIdPrefix}-search-input`}
                        type="search"
                        placeholder={searchPlaceholder}
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                    />
                </label>
                <div className="flex flex-wrap gap-3">
                    {lifecycleControl}
                    <label className="relative flex items-center gap-2 px-3 glass rounded-xl text-sm text-slate-300">
                        <Filter className="h-4 w-4" aria-hidden="true" />
                        <span>{filtersLabel}</span>
                        {activeFilterCount > 0 ? (
                            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent" aria-label={filterCountLabel}>
                                {activeFilterCount}
                            </span>
                        ) : null}
                        <select
                            data-testid={`${testIdPrefix}-add-filter`}
                            aria-label={filtersLabel}
                            value=""
                            onChange={(event) => {
                                if (event.target.value) onAddFilter(event.target.value);
                            }}
                            className="absolute inset-0 cursor-pointer opacity-0"
                        >
                            <option value="">{filtersLabel}</option>
                            {availableFilters.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                    <button
                        type="button"
                        onClick={onRefresh}
                        data-testid={`${testIdPrefix}-refresh-button`}
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors"
                        aria-label={refreshLabel}
                    >
                        <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin text-accent' : ''}`} aria-hidden="true" />
                    </button>
                </div>
            </div>

            {children ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div> : null}

            {chips.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2" aria-live="polite">
                    {chips.map((chip) => (
                        <span key={chip.key} data-testid={`${testIdPrefix}-filter-chip-${chip.key}`} className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-3 py-1.5 text-xs text-slate-200">
                            {chip.label}
                            <button
                                type="button"
                                onClick={() => onRemoveFilter(chip.key)}
                                aria-label={removeFilterLabel(chip.label)}
                                className="rounded-full p-0.5 hover:bg-white/10"
                            >
                                <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                        </span>
                    ))}
                    <button type="button" data-testid={`${testIdPrefix}-clear-filters`} onClick={onClearAll} className="text-xs font-semibold text-accent hover:text-white">
                        {clearAllLabel}
                    </button>
                </div>
            ) : null}
        </section>
    );
}
