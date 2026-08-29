import type { ReactNode } from 'react';
import { Filter, RefreshCw, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
            <div className="flex flex-col items-start gap-4 xl:flex-row">
                <label className="relative block w-full min-w-0 flex-1">
                    <span className="sr-only">{searchPlaceholder}</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-icon-muted" aria-hidden="true" />
                    <Input
                        data-testid={`${testIdPrefix}-search-input`}
                        type="search"
                        placeholder={searchPlaceholder}
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        className="pl-10"
                    />
                </label>
                <div className="flex flex-wrap items-start gap-3">
                    {lifecycleControl}
                    <label className="glass relative flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-foreground focus-within:outline-none focus-within:ring-1 focus-within:ring-ring">
                        <Filter className="h-4 w-4" aria-hidden="true" />
                        <span>{filtersLabel}</span>
                        {activeFilterCount > 0 ? (
                            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent-text" aria-label={filterCountLabel}>
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
                    <Button
                        variant="secondary"
                        size="icon"
                        onClick={onRefresh}
                        data-testid={`${testIdPrefix}-refresh-button`}
                        aria-label={refreshLabel}
                        title={refreshLabel}
                        isLoading={isLoading}
                    >
                        {!isLoading ? <RefreshCw aria-hidden="true" /> : null}
                    </Button>
                </div>
            </div>

            {children ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div> : null}

            {chips.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2" aria-live="polite">
                    {chips.map((chip) => (
                        <span key={chip.key} data-testid={`${testIdPrefix}-filter-chip-${chip.key}`} className="inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent/10 py-1 pl-3 pr-1 text-xs text-accent-text">
                            {chip.label}
                            <Button
                                variant="secondary"
                                size="iconCompact"
                                onClick={() => onRemoveFilter(chip.key)}
                                aria-label={removeFilterLabel(chip.label)}
                                className="rounded-full"
                            >
                                <X className="h-3 w-3" aria-hidden="true" />
                            </Button>
                        </span>
                    ))}
                    <Button variant="secondary" size="compact" data-testid={`${testIdPrefix}-clear-filters`} onClick={onClearAll}>
                        {clearAllLabel}
                    </Button>
                </div>
            ) : null}
        </section>
    );
}
