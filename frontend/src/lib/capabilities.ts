export function resolveCapability(
    backendValue: boolean | null | undefined,
    fallbackValue: boolean,
): boolean {
    return typeof backendValue === 'boolean' ? backendValue : fallbackValue;
}

export function resolveCapabilityFlag<T extends object, K extends keyof T>(
    capabilities: T | null | undefined,
    key: K,
    fallbackValue: boolean,
): boolean {
    return resolveCapability(capabilities?.[key] as boolean | null | undefined, fallbackValue);
}
