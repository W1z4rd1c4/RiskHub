function normalizeTitleKey(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, ' ')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

/**
 * Removes the first markdown H1 when it duplicates the reader header title.
 */
export function stripDuplicateLeadingTitle(content: string, docTitle: string): string {
    if (!content || !docTitle.trim()) {
        return content;
    }

    const lines = content.split('\n');
    let firstContentLine = 0;
    while (firstContentLine < lines.length && lines[firstContentLine].trim() === '') {
        firstContentLine += 1;
    }

    if (firstContentLine >= lines.length) {
        return content;
    }

    const headingMatch = lines[firstContentLine].match(/^#\s+(.+?)\s*$/);
    if (!headingMatch) {
        return content;
    }

    const headingKey = normalizeTitleKey(headingMatch[1]);
    const titleKey = normalizeTitleKey(docTitle);
    if (!headingKey || headingKey !== titleKey) {
        return content;
    }

    const remainder = lines.slice(firstContentLine + 1);
    while (remainder.length > 0 && remainder[0].trim() === '') {
        remainder.shift();
    }

    const leadingWhitespace = lines.slice(0, firstContentLine).join('\n');
    if (!leadingWhitespace) {
        return remainder.join('\n');
    }

    if (remainder.length === 0) {
        return leadingWhitespace;
    }

    return `${leadingWhitespace}\n${remainder.join('\n')}`;
}
