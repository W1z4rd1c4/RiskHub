/**
 * Readable fallback for a machine code that has no translation (audit
 * 2026-09-30 GAP-D-02). Callers translate first and pass this as the
 * `defaultValue`, so a code without a locale key still reads as words instead
 * of leaking `snake_case`:
 *
 *   t(`admin:audit.events.${code}`, { defaultValue: humanizeCode(code) })
 *
 * `risk_update` / `risk-update` -> "Risk update". Empty input gives "".
 */
export function humanizeCode(code: string | null | undefined): string {
    const words = (code ?? '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!words) return '';
    const [first, ...rest] = Array.from(words);
    return `${first.toLocaleUpperCase()}${rest.join('')}`;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Translates a machine code through `<keyPrefix>.<code>` and falls back to
 * `humanizeCode(code)` when the locale has no entry for it, so a code added by
 * the backend never shows up as raw `snake_case` (GAP-D-02). `t` is the caller's
 * own translate function, so the namespace is the caller's.
 */
export function translateCode(t: Translate, keyPrefix: string, code: string | null | undefined): string {
    if (!code) return '';
    return t(`${keyPrefix}.${code}`, { defaultValue: humanizeCode(code) });
}
