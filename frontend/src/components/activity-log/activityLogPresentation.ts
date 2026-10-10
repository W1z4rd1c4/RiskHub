/**
 * Title-cased words of a machine code (`issue_exception` -> `Issue Exception`): the
 * fallback label for an entity type the locale files do not know yet, so a type
 * the backend adds later still reads as words (GAP-D-02).
 */
export const titleCaseCode = (code: string): string => code
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

/** `emptyLabel` is the translated `common:activity_log.empty_value` (the default keeps pure callers readable). */
export const formatDiffValue = (value: unknown, emptyLabel = '(empty)'): string => {
    if (value === null || value === undefined) {
        return emptyLabel;
    }
    if (typeof value === 'object') {
        const json = JSON.stringify(value);
        return json.length > 80 ? `${json.slice(0, 77)}...` : json;
    }
    return String(value);
};

export const getDiffPair = (
    delta: unknown,
    emptyLabel = '(empty)',
): { old: string; new: string; isLegacy: boolean } => {
    if (delta === null || delta === undefined) {
        return { old: emptyLabel, new: emptyLabel, isLegacy: true };
    }
    if (typeof delta !== 'object') {
        return { old: emptyLabel, new: formatDiffValue(delta, emptyLabel), isLegacy: true };
    }

    const diff = delta as { old?: unknown; new?: unknown };
    return {
        old: formatDiffValue(diff.old, emptyLabel),
        new: formatDiffValue(diff.new, emptyLabel),
        isLegacy: !('old' in diff && 'new' in diff),
    };
};
