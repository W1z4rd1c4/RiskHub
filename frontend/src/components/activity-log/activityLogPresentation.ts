export const formatDiffValue = (value: unknown): string => {
    if (value === null || value === undefined) {
        return '(empty)';
    }
    if (typeof value === 'object') {
        const json = JSON.stringify(value);
        return json.length > 80 ? `${json.slice(0, 77)}...` : json;
    }
    return String(value);
};

export const getDiffPair = (delta: unknown): { old: string; new: string; isLegacy: boolean } => {
    if (delta === null || delta === undefined) {
        return { old: '(empty)', new: '(empty)', isLegacy: true };
    }
    if (typeof delta !== 'object') {
        return { old: '(empty)', new: formatDiffValue(delta), isLegacy: true };
    }

    const diff = delta as { old?: unknown; new?: unknown };
    return {
        old: formatDiffValue(diff.old),
        new: formatDiffValue(diff.new),
        isLegacy: !('old' in diff && 'new' in diff),
    };
};
