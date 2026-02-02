import { apiClient } from './apiClient';
import type {
    VendorAssessment,
    VendorAssessmentCommitteeRecommend,
    VendorAssessmentDecide,
    VendorAssessmentDraftUpdate,
} from '@/types/vendorAssessment';

export const vendorAssessmentApi = {
    getVendorAssessments: (vendorId: number) =>
        apiClient.get<VendorAssessment[]>(`/vendors/${vendorId}/assessments`),

    createVendorAssessment: (vendorId: number) =>
        apiClient.post<VendorAssessment>(`/vendors/${vendorId}/assessments`, {}),

    getAssessment: (assessmentId: number) =>
        apiClient.get<VendorAssessment>(`/vendor-assessments/${assessmentId}`),

    updateDraft: (assessmentId: number, payload: VendorAssessmentDraftUpdate) =>
        apiClient.patch<VendorAssessment>(`/vendor-assessments/${assessmentId}/draft`, payload),

    submit: (assessmentId: number) =>
        apiClient.post<VendorAssessment>(`/vendor-assessments/${assessmentId}/submit`, {}),

    review: (assessmentId: number) =>
        apiClient.post<VendorAssessment>(`/vendor-assessments/${assessmentId}/review`, {}),

    committeeRecommend: (assessmentId: number, payload: VendorAssessmentCommitteeRecommend) =>
        apiClient.post<VendorAssessment>(`/vendor-assessments/${assessmentId}/committee-recommend`, payload),

    decide: (assessmentId: number, payload: VendorAssessmentDecide) =>
        apiClient.post<VendorAssessment>(`/vendor-assessments/${assessmentId}/decide`, payload),
};

