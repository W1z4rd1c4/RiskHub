export function sanitizeReturnTo(value: string | null | undefined): string {
    if (!value) return '/';
    const normalized = value.replace(/\\/g, '/').trim();
    if (!normalized || normalized.includes('\r') || normalized.includes('\n')) return '/';
    if (normalized.startsWith('/') && !normalized.startsWith('//')) return normalized;
    return '/';
}
