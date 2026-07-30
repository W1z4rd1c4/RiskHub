import { apiClient } from './apiClient';
import { ictDqViolationsPageSchema, ictRegisterDqSchema } from '@/services/api/schemas';
import type { IctDqViolationsPage, IctRegisterDq } from '@/types/ictRegisterDq';

export const ictRegisterDqApi = {
    /** All 52 workbook DQ checks, computed on read (issue #50). */
    async getDataQuality(): Promise<IctRegisterDq> {
        return apiClient.get('/ict-register/dq', { schema: ictRegisterDqSchema });
    },
    async getViolations(
        checkId: string,
        params: { offset: number; limit: number }
    ): Promise<IctDqViolationsPage> {
        return apiClient.get(`/ict-register/dq/${encodeURIComponent(checkId)}/violations`, {
            params,
            schema: ictDqViolationsPageSchema,
        });
    },
};
