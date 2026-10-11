/** Canonical governed request serialization: trim once and omit blank reasons. */
export function reasonField(requestReason?: string): { request_reason?: string } {
    const normalized = requestReason?.trim();
    return normalized ? { request_reason: normalized } : {};
}

/** Remove a caller's blank key as well as normalizing populated reasons. */
export function withReason<T extends object>(payload: T): Omit<T, 'request_reason'> & { request_reason?: string } {
    const { request_reason: requestReason, ...rest } = payload as T & { request_reason?: string };
    return { ...rest, ...reasonField(requestReason) };
}

/** Blank DELETE requests have no body, rather than an empty JSON object. */
export function reasonBody(requestReason?: string): { body?: string } {
    const field = reasonField(requestReason);
    return field.request_reason ? { body: JSON.stringify(field) } : {};
}
