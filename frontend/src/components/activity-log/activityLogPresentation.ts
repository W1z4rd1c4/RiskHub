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

export const calculatePageWindow = (page: number, totalPages: number): (number | 'ellipsis')[] => {
    const pageNumbers: number[] = [];
    const addPage = (candidate: number) => {
        if (candidate >= 0 && candidate < totalPages && !pageNumbers.includes(candidate)) {
            pageNumbers.push(candidate);
        }
    };

    addPage(0);
    addPage(page - 1);
    addPage(page);
    addPage(page + 1);
    addPage(totalPages - 1);
    pageNumbers.sort((left, right) => left - right);

    const withEllipses: (number | 'ellipsis')[] = [];
    for (let index = 0; index < pageNumbers.length; index += 1) {
        if (index > 0 && pageNumbers[index] - pageNumbers[index - 1] > 1) {
            withEllipses.push('ellipsis');
        }
        withEllipses.push(pageNumbers[index]);
    }

    return withEllipses;
};
