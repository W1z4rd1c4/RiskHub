import { useEffect, useRef } from 'react';

/**
 * Audit §4.8 / AX-04 form rule "focus on the first invalid field": after a
 * failed validation, focus the first control marked `aria-invalid="true"` (set
 * by `Field` from its `error`) inside the returned container, so its message
 * (`aria-describedby`) is read.
 *
 * `failedAttempt` must change only when a check fails (a failure counter, or
 * the error object of that check), never while the user edits a field, or
 * focus would jump away from the field being typed in. Falsy means "no failed
 * check yet".
 */
export function useFocusFirstInvalidField<T extends HTMLElement = HTMLFormElement>(failedAttempt: unknown) {
    const containerRef = useRef<T>(null);
    useEffect(() => {
        if (!failedAttempt) return;
        containerRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }, [failedAttempt]);
    return containerRef;
}
