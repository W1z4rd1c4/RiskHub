import { apiClient } from './apiClient';
import { ictCommitteeSchema } from '@/services/api/schemas';
import type { IctCommittee } from '@/types/ictRegisterCommittee';

export const ictRegisterCommitteeApi = {
    /** The ICT Risk Committee read model — both workbook output sheets (issue #51). */
    async getCommittee(): Promise<IctCommittee> {
        return apiClient.get('/ict-register/committee', { schema: ictCommitteeSchema });
    },
};
