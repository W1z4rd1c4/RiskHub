import { apiClient } from './apiClient';
import { ictRegisterDqSchema } from '@/services/api/schemas';
import type { IctRegisterDq } from '@/types/ictRegisterDq';

export const ictRegisterDqApi = {
    /** All 52 workbook DQ checks, computed on read (issue #50). */
    async getDataQuality(): Promise<IctRegisterDq> {
        return apiClient.get('/ict-register/dq', { schema: ictRegisterDqSchema });
    },
};
