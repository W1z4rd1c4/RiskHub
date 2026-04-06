import { useSyncExternalStore } from 'react';
import type { SessionSnapshot } from '@/services/sessionTypes';

function createInitialSessionSnapshot(): SessionSnapshot {
    return {
        token: null,
        user: null,
        bootstrapStatus: 'loading',
        bootstrapError: null,
        logoutPending: false,
        logoutErrorKey: null,
        lastUpdatedAt: Date.now(),
    };
}

let sessionSnapshot = createInitialSessionSnapshot();
const listeners = new Set<() => void>();

function notifyListeners(): void {
    listeners.forEach((listener) => listener());
}

export function getSessionSnapshot(): SessionSnapshot {
    return sessionSnapshot;
}

export function setSessionSnapshot(
    next: SessionSnapshot | ((previous: SessionSnapshot) => SessionSnapshot),
): void {
    const resolved = typeof next === 'function' ? next(sessionSnapshot) : next;
    sessionSnapshot = {
        ...resolved,
        lastUpdatedAt: Date.now(),
    };
    notifyListeners();
}

export function subscribeSessionSnapshot(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function useSessionSnapshot(): SessionSnapshot {
    return useSyncExternalStore(subscribeSessionSnapshot, getSessionSnapshot, getSessionSnapshot);
}

export function __resetSessionStoreForTests(): void {
    sessionSnapshot = createInitialSessionSnapshot();
    notifyListeners();
}
