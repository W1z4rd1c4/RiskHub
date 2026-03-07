let accessToken: string | null = null;
const listeners = new Set<(token: string | null) => void>();

function notifyListeners(): void {
    listeners.forEach((listener) => listener(accessToken));
}

export function getAccessToken(): string | null {
    return accessToken;
}

export function setAccessToken(token: string): void {
    accessToken = token;
    notifyListeners();
}

export function clearAccessToken(): void {
    accessToken = null;
    notifyListeners();
}

export function subscribeAccessToken(listener: (token: string | null) => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
