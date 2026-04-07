export const API_URL =
    typeof import.meta.env.VITE_API_URL === 'string' && import.meta.env.VITE_API_URL.length > 0
        ? import.meta.env.VITE_API_URL
        : '/api/v1';
