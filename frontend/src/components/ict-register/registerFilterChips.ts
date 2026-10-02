import type { SafeTFunction } from '@/i18n/hooks';
import type { CollectionFacetOption } from '@/types/collection';

import type { RegisterFilterChip } from './RegisterListToolbar';

/**
 * Active-filter chips for `RegisterListToolbar` (audit §4.13, PG-05): every
 * chip reads "Label: value" through one whole-phrase key
 * (`common:labels.label_value`), so no register prefixes a chip with an
 * "All …" placeholder or drops the selected value.
 */

/** Resolves the display label of a facet value, falling back to the raw value. */
export function resolveFacetValueLabel(
    options: readonly CollectionFacetOption[] | undefined,
    value: string | number | null | undefined,
    formatValue?: (value: string, fallback: string) => string,
): string {
    const raw = value === null || value === undefined ? '' : String(value);
    const fallback = options?.find((option) => option.value === raw)?.label ?? raw;
    return formatValue ? formatValue(raw, fallback) : fallback;
}

/** One "Label: value" chip. `t` must resolve `common:` keys. */
export function buildFilterChip(t: SafeTFunction, key: string, label: string, value: string): RegisterFilterChip {
    return { key, label: t('common:labels.label_value', { label, value }) };
}

/** A "Label: value" chip for a facet-backed filter (department, owner, status, …). */
export function buildFacetChip(
    t: SafeTFunction,
    key: string,
    label: string,
    options: readonly CollectionFacetOption[] | undefined,
    value: string | number | null | undefined,
    formatValue?: (value: string, fallback: string) => string,
): RegisterFilterChip {
    return buildFilterChip(t, key, label, resolveFacetValueLabel(options, value, formatValue));
}
