import { expect } from 'vitest';

// Vitest's asymmetric factories return any. Keep matcher values opaque when
// embedding them inside expected objects so they cannot leak unsafe properties.
export function anything(): unknown {
    return expect.anything();
}

export function objectContaining(sample: Record<string, unknown>): unknown {
    return expect.objectContaining(sample);
}
