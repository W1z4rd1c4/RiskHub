export function resolveCapability(backendValue: boolean | null | undefined): boolean {
    return backendValue === true;
}

export function resolveCapabilityFlag<T extends object, K extends keyof T>(
    capabilities: T | null | undefined,
    key: K,
): boolean {
    return resolveCapability(capabilities?.[key] as boolean | null | undefined);
}
