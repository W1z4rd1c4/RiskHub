/**
 * Governed-mutation request reason serialization, shared by the protected
 * Vendor mutation services (#100 vendorLinkApi, #101 vendorSubOutsourcingApi):
 * the reason is trimmed, and OMITTED entirely when blank, so a reason-less
 * direct call never invents a `request_reason` on the wire.
 */

/** Spread into a JSON payload: `{ request_reason }` or nothing. */
export function reasonField(requestReason?: string) {
    return requestReason?.trim() ? { request_reason: requestReason.trim() } : {};
}

/** Spread into DELETE options: `{ body }` carrying the reason, or nothing. */
export function reasonBody(requestReason?: string) {
    return requestReason?.trim() ? { body: JSON.stringify({ request_reason: requestReason.trim() }) } : {};
}
