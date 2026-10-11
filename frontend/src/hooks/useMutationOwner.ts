import { useLayoutEffect, useMemo, useRef } from 'react';

/** A committed owner generation, including A → B → A and unmount. */
export function useMutationOwner(ownerKey: string | number | boolean | undefined) {
    const epoch = useMemo(() => ({ ownerKey }), [ownerKey]);
    const current = useRef<typeof epoch | null>(null);
    useLayoutEffect(() => {
        current.current = epoch;
        return () => { if (current.current === epoch) current.current = null; };
    }, [epoch]);
    return useMemo(() => ({
        epoch,
        capture: () => () => current.current === epoch,
    }), [epoch]);
}
