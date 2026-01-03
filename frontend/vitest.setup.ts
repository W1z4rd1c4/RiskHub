import '@testing-library/jest-dom/vitest';

class LocalStorageMock {
    private store = new Map<string, string>();

    getItem(key: string) {
        return this.store.has(key) ? this.store.get(key)! : null;
    }

    setItem(key: string, value: string) {
        this.store.set(key, String(value));
    }

    removeItem(key: string) {
        this.store.delete(key);
    }

    clear() {
        this.store.clear();
    }
}

const ensureLocalStorage = () => {
    const target = typeof window !== 'undefined' ? window : globalThis;
    if (!target.localStorage || typeof target.localStorage.getItem !== 'function') {
        Object.defineProperty(target, 'localStorage', {
            value: new LocalStorageMock(),
            configurable: true,
        });
    }
};

ensureLocalStorage();
afterEach(() => {
    if (typeof localStorage !== 'undefined') {
        localStorage.clear();
    }
});

// Optional: Setup MSW server for API mocking
// import { server } from './src/test/mocks/server';
// beforeAll(() => server.listen());
// afterEach(() => server.resetHandlers());
// afterAll(() => server.close());
