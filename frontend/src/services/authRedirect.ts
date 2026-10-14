// A fixed origin keeps validation independent of browser globals and SSR.
const RETURN_TO_ORIGIN = 'https://riskhub.invalid';

export function sanitizeReturnTo(value: string | null | undefined): string {
    if (!value) return '/';
    // Reject controls before trimming: URL parsing removes literal tabs/newlines
    // and could reinterpret a seemingly relative path as an external authority.
    const hasControlCharacter = Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || (code >= 127 && code <= 159);
    });
    if (hasControlCharacter) return '/';

    const normalized = value.replace(/\\/g, '/').trim();
    if (!normalized.startsWith('/') || normalized.startsWith('//')) return '/';
    try {
        if (new URL(normalized, RETURN_TO_ORIGIN).origin !== RETURN_TO_ORIGIN) return '/';
    } catch {
        return '/';
    }
    // Keep query/hash encoding intact. URLSearchParams at the login boundary
    // already decoded the outer returnTo once; never decode the destination again.
    return normalized;
}
