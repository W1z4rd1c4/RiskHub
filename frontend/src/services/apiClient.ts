import { ApiClient } from '@/services/api/ApiClientCore';
import { API_URL } from '@/services/api/apiConfig';
import { ApiClientError } from '@/services/api/apiErrors';

export { ApiClientError } from '@/services/api/apiErrors';
export type {
    ApiClientErrorPayload,
    PreparedRequest,
    QueryParams,
    QueryScalar,
    QueryValue,
    RequestExecutorOptions,
    RequestOptions,
    SchemaRequestOptions,
} from '@/services/api/apiTypes';

export const apiClient = new ApiClient(API_URL);

export function isForbiddenApiError(error: unknown): boolean {
    return error instanceof ApiClientError && error.status === 403;
}
