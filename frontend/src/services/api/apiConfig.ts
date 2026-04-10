export const API_URL =
    typeof import.meta.env.VITE_API_URL === 'string' && import.meta.env.VITE_API_URL.length > 0
        ? import.meta.env.VITE_API_URL
        : '/api/v1';

let apiRuntimeOrigin =
    typeof import.meta.env.VITE_API_ORIGIN === 'string' && import.meta.env.VITE_API_ORIGIN.length > 0
        ? import.meta.env.VITE_API_ORIGIN
        : typeof window !== 'undefined'
            ? window.location.origin
            : 'http://localhost';

export function getApiRuntimeOrigin(): string {
    return apiRuntimeOrigin;
}

export function setApiRuntimeOrigin(origin: string): void {
    apiRuntimeOrigin = origin;
}
