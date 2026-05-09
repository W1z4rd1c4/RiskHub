let strictCapabilitiesEnabled = false;
const strictCapabilityListeners = new Set<() => void>();

export function setStrictCapabilitiesEnabled(enabled: boolean): void {
    if (strictCapabilitiesEnabled === enabled) return;
    strictCapabilitiesEnabled = enabled;
    strictCapabilityListeners.forEach((listener) => listener());
}

export function isStrictCapabilitiesEnabled(): boolean {
    return strictCapabilitiesEnabled;
}

export function subscribe(callback: () => void): () => void {
    strictCapabilityListeners.add(callback);
    return () => {
        strictCapabilityListeners.delete(callback);
    };
}
