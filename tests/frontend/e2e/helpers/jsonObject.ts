function isJsonObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read an untrusted JSON object without propagating JSON.parse/response.json any. */
export function jsonObject(value: unknown): Record<string, unknown> {
    if (!isJsonObject(value)) {
        throw new Error('Expected a JSON object');
    }
    return value;
}
