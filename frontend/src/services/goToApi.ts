import { apiClient } from '@/services/apiClient';
import { goToRecordListSchema } from '@/services/api/schemas';

export const goToApi = {
    getRecords: (q: string) => apiClient.get('/go-to/records', {
        params: { q },
        schema: goToRecordListSchema,
    }),
};
