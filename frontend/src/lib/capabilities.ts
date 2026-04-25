export function resolveCapability(
    backendValue: boolean | null | undefined,
    fallbackValue: boolean,
): boolean {
    return typeof backendValue === 'boolean' ? backendValue : fallbackValue;
}

export function resolveCapabilityFlag<T extends Record<string, boolean>>(
    capabilities: T | null | undefined,
    key: keyof T,
    fallbackValue: boolean,
): boolean {
    return resolveCapability(capabilities?.[key], fallbackValue);
}
