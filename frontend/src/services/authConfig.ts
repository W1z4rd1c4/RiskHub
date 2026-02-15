import { authApi, type AuthConfigResponse } from '@/services/authApi';

let authConfigCache: AuthConfigResponse | null = null;
let authConfigInFlight: Promise<AuthConfigResponse> | null = null;

export async function getAuthConfig(): Promise<AuthConfigResponse> {
    if (authConfigCache) return authConfigCache;
    if (!authConfigInFlight) {
        authConfigInFlight = authApi.getAuthConfig()
            .then((config) => {
                authConfigCache = config;
                return config;
            })
            .finally(() => {
                authConfigInFlight = null;
            });
    }
    return authConfigInFlight;
}

export function clearAuthConfigCache(): void {
    authConfigCache = null;
    authConfigInFlight = null;
}

