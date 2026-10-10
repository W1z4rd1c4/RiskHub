import type { SafeTFunction } from '@/i18n/hooks';

/**
 * KRI unit codes → translated labels (audit GAP-D-03). The stored value stays
 * the raw code (`%`, `count`, `days`, `hours`, `ratio`, `CZK`, `EUR`); only the
 * display is translated. Currency codes and `%` are language-neutral and pass
 * through, as does any unknown (free-text) unit.
 */

/** Codes with a translated name under `kris:form.units.*`. */
const KRI_UNIT_NAME_KEYS: Readonly<Record<string, string>> = {
    '%': 'kris:form.units.percentage',
    count: 'kris:form.units.count',
    days: 'kris:form.units.days',
    hours: 'kris:form.units.hours',
    ratio: 'kris:form.units.ratio',
};

/** Codes with a translated short suffix under `kris:unit_suffix.*` (plural families for days/hours). */
const KRI_UNIT_SUFFIX_KEYS: Readonly<Record<string, string>> = {
    count: 'kris:unit_suffix.count',
    days: 'kris:unit_suffix.days',
    hours: 'kris:unit_suffix.hours',
    ratio: 'kris:unit_suffix.ratio',
};

/** The unit's name, for a "Unit" field or select option ("Days", "% (Percentage)"). */
export function formatKriUnitName(unit: string | null | undefined, t: SafeTFunction): string {
    if (!unit) return '';
    const key = KRI_UNIT_NAME_KEYS[unit];
    return key ? t(key) : unit;
}

/**
 * The unit as a suffix after a value ("12 days", "5 dní", "40 %"). Pass the
 * value as `count` so day/hour units agree with it (cs `_one/_few/_other`).
 */
export function formatKriUnit(unit: string | null | undefined, t: SafeTFunction, count?: number | null): string {
    if (!unit) return '';
    const key = KRI_UNIT_SUFFIX_KEYS[unit];
    if (!key) return unit;
    // Without a value, 0 selects the generic plural (`_other`) in both languages.
    return t(key, { count: typeof count === 'number' && Number.isFinite(count) ? count : 0 });
}
