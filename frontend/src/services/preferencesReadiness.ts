let preferencesReady = true;

const listeners = new Set<(ready: boolean) => void>();

export function getPreferencesReady(): boolean {
    return preferencesReady;
}

export function setPreferencesReady(ready: boolean): void {
    preferencesReady = ready;
    for (const listener of listeners) {
        listener(ready);
    }
}

export function subscribePreferencesReady(listener: (ready: boolean) => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function __resetPreferencesReadyForTests(): void {
    preferencesReady = true;
    listeners.clear();
}
