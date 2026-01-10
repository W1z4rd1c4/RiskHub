import { useState, useEffect } from 'react';

/**
 * Returns a debounced version of the input value.
 * The returned value only updates after `delayMs` milliseconds
 * of no changes to the input value.
 *
 * @param value - The value to debounce
 * @param delayMs - Debounce delay in milliseconds (default: 300)
 * @returns The debounced value
 */
export function useDebouncedValue<T>(value: T, delayMs: number = 300): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedValue(value);
        }, delayMs);

        return () => clearTimeout(timer);
    }, [value, delayMs]);

    return debouncedValue;
}
