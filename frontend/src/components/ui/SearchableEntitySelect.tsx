import type { AriaAttributes, Ref } from 'react';
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
    disabled?: boolean;
    triggerRef?: Ref<HTMLButtonElement>;
    id?: string;
    'aria-labelledby'?: string;
    'aria-describedby'?: string;
    'aria-invalid'?: AriaAttributes['aria-invalid'];
    'aria-required'?: AriaAttributes['aria-required'];
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
    disabled = false,
    triggerRef,
    id,
    'aria-labelledby': ariaLabelledby,
    'aria-describedby': ariaDescribedby,
    'aria-invalid': ariaInvalid,
    'aria-required': ariaRequired,
}: SearchableEntitySelectProps) {
    const { t } = useTranslation('common');
    return (
        <div className="space-y-2">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                <input
                    type="text"
                    disabled={disabled}
                    value={searchValue}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder={searchPlaceholder ?? t('filters.search_items')}
                    aria-label={searchPlaceholder ?? t('filters.search_items')}
                    data-testid={triggerTestId ? `${triggerTestId}-search` : undefined}
                    className="w-full glass rounded-lg pl-8 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground bg-white/5 border border-white/10 focus:outline-none focus:border-accent/50"
                />
            </div>
            <ThemedSelect
                id={id}
                value={value}
                onValueChange={onValueChange}
                options={options}
                placeholder={placeholder}
                disabled={disabled}
                triggerTestId={triggerTestId}
                triggerRef={triggerRef}
                aria-labelledby={ariaLabelledby}
                aria-describedby={ariaDescribedby}
                aria-invalid={ariaInvalid}
                aria-required={ariaRequired}
            />
        </div>
    );
}
