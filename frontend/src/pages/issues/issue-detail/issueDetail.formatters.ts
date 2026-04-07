export function formatDateTime(value: string | null, locale: string, notSetLabel: string): string {
    if (!value) {
        return notSetLabel;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(parsed);
}

export function exceptionActorName(
    requestedByName: string | null,
    approvedByName: string | null,
    unknownUserLabel: string,
): string {
    if (approvedByName) {
        return approvedByName;
    }
    if (requestedByName) {
        return requestedByName;
    }
    return unknownUserLabel;
}
