import { Search } from 'lucide-react';

import { ThemedSelect, type SelectOption } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';

export interface SearchableEntitySelectProps {
    value: string;
    onValueChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    /** Raw (undebounced) search text; the owner debounces and refetches server-side. */
    searchValue: string;
    onSearchChange: (value: string) => void;
    searchPlaceholder?: string;
    triggerTestId?: string;
}

/**
 * A link-picker select with a server-driven search box (the KRI-form lookup
 * precedent): typing narrows the option query via the list endpoint's
 * `search` param, so the picker is never capped at the first page of rows.
 * The empty search keeps a sane initial page.
 */
export function SearchableEntitySelect({
    value,
    onValueChange,
    options,
    placeholder,
    searchValue,
    onSearchChange,
    searchPlaceholder,
    triggerTestId,
}: SearchableEntitySelectProps) {
    const { t } = useTranslation('common');
    return (
        <div className="space-y-2">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                <input
                    type="text"
                    value={searchValue}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder={searchPlaceholder ?? t('filters.search_items')}
                    aria-label={searchPlaceholder ?? t('filters.search_items')}
                    data-testid={triggerTestId ? `${triggerTestId}-search` : undefined}
                    className="w-full glass rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder:text-slate-500 bg-white/5 border border-white/10 focus:outline-none focus:border-accent/50"
                />
            </div>
            <ThemedSelect
                value={value}
                onValueChange={onValueChange}
                options={options}
                placeholder={placeholder}
                triggerTestId={triggerTestId}
            />
        </div>
    );
}
