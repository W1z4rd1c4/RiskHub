import type { UiMessageTranslator } from '@/i18n/hooks';

/**
 * Display labels for the ICT Register workbook closed lists (audit 2026-09-30
 * GAP-C-09, PM-4).
 *
 * The API stores and validates the workbook's verbatim Czech codes ("Ano",
 * "Rámcové (master)", ...), so those raw values are what option `value`s carry
 * and what the forms send back. Only the label a user reads is translated:
 * each listed code maps to a stable slug under
 * `common:values.closed_lists.<List>.<slug>` (en + cs). A code without a slug
 * (language-neutral codes such as currencies, countries or identifier types,
 * or a value the workbook adds later) renders as the raw value.
 */
const CLOSED_LIST_LABEL_SLUGS = {
    AnoNe: { Ano: 'yes', Ne: 'no' },
    TypUjednani: {
        'Samostatné': 'standalone',
        'Rámcové (master)': 'master',
        'Navazující': 'subsequent',
    },
    SystemEvidence: { 'Jiné': 'other' },
    TypOsoby: {
        'Právnická osoba': 'legal_person',
        'Fyzická osoba podnikající': 'individual_entrepreneur',
    },
    VyznamVazby: {
        'Kritická podpora procesu': 'critical_support',
        'Významná podpora procesu': 'significant_support',
        'Podpůrná vazba': 'supporting',
        'Nepřímá / sdílená vazba': 'indirect_shared',
        'BCM/DR vazba': 'bcm_dr',
        'Neposouzeno': 'not_assessed',
    },
    RoleDodavatele: {
        'Dodává': 'supplies',
        'Provozuje': 'operates',
        'Hostuje': 'hosts',
        'Spravuje': 'manages',
        'Podporuje': 'supports',
        'Zpracovává data': 'processes_data',
        'Zálohuje / obnova': 'backup_recovery',
        'Bezpečnostní služba': 'security_service',
        'Jiné': 'other',
    },
    Reliance: {
        'Nevýznamná': 'not_significant',
        'Nízká závislost': 'low',
        'Zásadní závislost': 'material',
        'Úplná závislost': 'full',
    },
    TypZavislostiAktiv: {
        'Běhová (runtime)': 'runtime',
        'Datová': 'data',
        'Síťová / infrastrukturní': 'network_infrastructure',
        'Bezpečnostní': 'security',
        'Zálohovací / recovery': 'backup_recovery',
        'Provozní': 'operational',
        'Jiná': 'other',
    },
} as const satisfies Readonly<Record<string, Readonly<Record<string, string>>>>;

export type TranslatedClosedList = keyof typeof CLOSED_LIST_LABEL_SLUGS;

/** Every translated list with its `code → slug` map (the locale test walks it). */
export const TRANSLATED_CLOSED_LISTS: Readonly<Record<TranslatedClosedList, Readonly<Record<string, string>>>> =
    CLOSED_LIST_LABEL_SLUGS;

export type ClosedListValues = Readonly<Record<string, ReadonlyArray<string | number>>>;

function slugFor(list: string, value: string): string | undefined {
    const slugs: Readonly<Record<string, string>> | undefined =
        (TRANSLATED_CLOSED_LISTS as Readonly<Record<string, Readonly<Record<string, string>>>>)[list];
    return slugs?.[value];
}

/** The translated label of one stored closed-list value; the raw value when the code has no label. */
export function closedListLabel(t: UiMessageTranslator, list: string, value: string | number): string {
    const raw = String(value);
    const slug = slugFor(list, raw);
    if (!slug) return raw;
    return t(`common:values.closed_lists.${list}.${slug}`, { defaultValue: raw });
}

/** `ThemedSelect` options for one closed list: the raw stored value with its translated label. */
export function closedListOptions(
    t: UiMessageTranslator,
    lists: ClosedListValues,
    list: string,
): Array<{ value: string; label: string }> {
    return (lists[list] ?? []).map((value) => ({ value: String(value), label: closedListLabel(t, list, value) }));
}
