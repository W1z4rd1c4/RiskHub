import { useState } from 'react';

/**
 * Register builders produce JSON request data. URL parsing may recreate their
 * filters/sort on every keystroke, while the debounced request is unchanged.
 * Depend on that request's value, not the temporary objects that built it.
 *
 * Keep this memo local to the mounted register: it is not a response cache or a
 * refresh guard. The identity omits undefined optional fields, just as existing
 * query identities do, but the retained request keeps its original shape.
 * Array order is preserved; object key order is irrelevant.
 */
export function useStableRegisterRequestParams<T extends object>(params: T): T {
    const identity = JSON.stringify(params, (_key, value: unknown) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
        return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
    });
    const [snapshot, setSnapshot] = useState(() => ({ identity, params }));
    if (snapshot.identity !== identity) {
        // Adjust only this component's derived state during render, before any
        // fetch effect can observe a stale request. Do not mutate a render ref or
        // reconstruct JSON: callers also rely on explicit undefined properties.
        setSnapshot({ identity, params });
        return params;
    }
    return snapshot.params;
}
