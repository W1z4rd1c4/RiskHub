export function toDateTimeLocalInputValue(value: string | Date | null | undefined): string {
    if (!value) {
        return '';
    }

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }

    const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}

export function fromDateTimeLocalInputValue(value: string): string | undefined {
    if (!value) {
        return undefined;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return undefined;
    }

    return parsed.toISOString();
}
