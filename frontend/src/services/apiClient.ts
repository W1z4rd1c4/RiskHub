

// Use relative URL for nginx proxy (enables LAN access)
// In development, VITE_API_URL can override for direct backend connection
const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

interface RequestOptions extends RequestInit {
    params?: Record<string, string | number | boolean | undefined | string[] | number[]>;

}

class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
        const { params, ...init } = options;

        // Build URL with query params
        // Use origin as base when baseUrl is relative (starts with /)
        const baseOrigin = this.baseUrl.startsWith('/') ? window.location.origin : '';
        const url = new URL(`${baseOrigin}${this.baseUrl}${endpoint}`);
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) {
                    if (Array.isArray(value)) {
                        value.forEach(v => url.searchParams.append(key, String(v)));
                    } else {
                        url.searchParams.append(key, String(value));
                    }
                }
            });
        }

        // Prepare headers
        const headers = new Headers(init.headers);

        // Add Authorization header
        const token = localStorage.getItem('access_token');
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }



        // Default content type for mutations
        if (!headers.has('Content-Type') && (init.method === 'POST' || init.method === 'PUT' || init.method === 'PATCH')) {
            headers.set('Content-Type', 'application/json');
        }

        const config: RequestInit = {
            ...init,
            headers,
        };

        try {
            const response = await fetch(url.toString(), config);

            if (response.status === 401) {
                // Token expired or invalid
                localStorage.removeItem('access_token');
                window.location.href = '/login'; // Simple redirect for now, could dispatch event
                throw new Error('Unauthorized');
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                // Handle FastAPI error formats - detail can be string or array
                let errorMessage: string;
                if (typeof errorData.detail === 'string') {
                    errorMessage = errorData.detail;
                } else if (Array.isArray(errorData.detail)) {
                    // FastAPI validation errors return array of {loc, msg, type}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    errorMessage = errorData.detail.map((e: any) => e.msg || e.message || JSON.stringify(e)).join('; ');
                } else if (errorData.detail) {
                    errorMessage = JSON.stringify(errorData.detail);
                } else {
                    errorMessage = `Request failed with status ${response.status}`;
                }
                console.error('[apiClient] Request error:', response.status, errorMessage);
                throw new Error(errorMessage);
            }

            // Return empty for 204 No Content
            if (response.status === 204) {
                return {} as T;
            }

            return response.json();
        } catch (error) {
            console.error('API Request failed:', error);
            throw error;
        }
    }

    get<T>(endpoint: string, options?: RequestOptions) {
        return this.request<T>(endpoint, { ...options, method: 'GET' });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    post<T>(endpoint: string, body: any, options?: RequestOptions) {
        return this.request<T>(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    put<T>(endpoint: string, body: any, options?: RequestOptions) {
        return this.request<T>(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    patch<T>(endpoint: string, body: any, options?: RequestOptions) {
        return this.request<T>(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) });
    }

    delete<T>(endpoint: string, options?: RequestOptions) {
        return this.request<T>(endpoint, { ...options, method: 'DELETE' });
    }

    /**
     * Download a binary blob from the API.
     * Uses the same base URL and auth logic as other requests.
     */
    async getBlob(endpoint: string, options: RequestOptions = {}): Promise<{ blob: Blob; headers: Headers }> {
        const { params, ...init } = options;

        // Build URL with query params (same logic as request())
        const baseOrigin = this.baseUrl.startsWith('/') ? window.location.origin : '';
        const url = new URL(`${baseOrigin}${this.baseUrl}${endpoint}`);
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) {
                    if (Array.isArray(value)) {
                        value.forEach(v => url.searchParams.append(key, String(v)));
                    } else {
                        url.searchParams.append(key, String(value));
                    }
                }
            });
        }

        // Prepare headers with Authorization (same logic as request())
        const headers = new Headers(init.headers);
        const token = localStorage.getItem('access_token');
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        const config: RequestInit = { ...init, method: 'GET', headers };

        const response = await fetch(url.toString(), config);

        if (response.status === 401) {
            localStorage.removeItem('access_token');
            window.location.href = '/login';
            throw new Error('Unauthorized');
        }

        if (!response.ok) {
            throw new Error(`Download failed: ${response.statusText}`);
        }

        return { blob: await response.blob(), headers: response.headers };
    }
}

export const apiClient = new ApiClient(API_URL);
