import { apiClient } from './apiClient';
import type {
    VendorIncident,
    VendorIncidentCreate,
    VendorRemediationAction,
    VendorRemediationCreate,
    VendorRemediationUpdate,
} from '@/types/vendorIncident';

export const vendorIncidentApi = {
    listIncidents: (vendorId: number) =>
        apiClient.get<VendorIncident[]>(`/vendors/${vendorId}/incidents`),

    createIncident: (vendorId: number, payload: VendorIncidentCreate) =>
        apiClient.post<VendorIncident>(`/vendors/${vendorId}/incidents`, payload),

    updateIncident: (incidentId: number, payload: Partial<VendorIncidentCreate>) =>
        apiClient.patch<VendorIncident>(`/vendor-incidents/${incidentId}`, payload),

    deleteIncident: (incidentId: number) =>
        apiClient.delete<void>(`/vendor-incidents/${incidentId}`),

    listRemediation: (vendorId: number) =>
        apiClient.get<VendorRemediationAction[]>(`/vendors/${vendorId}/remediation`),

    createRemediation: (vendorId: number, payload: VendorRemediationCreate) =>
        apiClient.post<VendorRemediationAction>(`/vendors/${vendorId}/remediation`, payload),

    updateRemediation: (remediationId: number, payload: VendorRemediationUpdate) =>
        apiClient.patch<VendorRemediationAction>(`/vendor-remediation/${remediationId}`, payload),

    deleteRemediation: (remediationId: number) =>
        apiClient.delete<void>(`/vendor-remediation/${remediationId}`),
};

