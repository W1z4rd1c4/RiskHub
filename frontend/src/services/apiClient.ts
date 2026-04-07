import { ApiClient } from '@/services/api/ApiClientCore';
import { API_URL } from '@/services/api/apiConfig';

export { ApiClientError } from '@/services/api/apiErrors';
export type {
    ApiClientErrorPayload,
    PreparedRequest,
    QueryParams,
    QueryScalar,
    QueryValue,
    RequestExecutorOptions,
    RequestOptions,
} from '@/services/api/apiTypes';

export const apiClient = new ApiClient(API_URL);
