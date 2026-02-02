import { apiClient } from './apiClient';
import type {
    VendorDependenciesResponse,
    VendorRelationship,
    VendorRelationshipCreate,
    VendorService,
    VendorServiceCreate,
    VendorDependency,
    VendorDependencyCreate,
} from '@/types/vendorDependency';

export const vendorDependencyApi = {
    getVendorDependencies: (vendorId: number) =>
        apiClient.get<VendorDependenciesResponse>(`/vendors/${vendorId}/dependencies`),

    createRelationship: (vendorId: number, payload: VendorRelationshipCreate) =>
        apiClient.post<VendorRelationship>(`/vendors/${vendorId}/relationships`, payload),

    deleteRelationship: (relationshipId: number) =>
        apiClient.delete<void>(`/vendor-relationships/${relationshipId}`),

    createService: (vendorId: number, payload: VendorServiceCreate) =>
        apiClient.post<VendorService>(`/vendors/${vendorId}/services`, payload),

    updateService: (serviceId: number, payload: Partial<VendorServiceCreate>) =>
        apiClient.patch<VendorService>(`/vendor-services/${serviceId}`, payload),

    deleteService: (serviceId: number) =>
        apiClient.delete<void>(`/vendor-services/${serviceId}`),

    createDependency: (serviceId: number, payload: VendorDependencyCreate) =>
        apiClient.post<VendorDependency>(`/vendor-services/${serviceId}/dependencies`, payload),

    deleteDependency: (dependencyId: number) =>
        apiClient.delete<void>(`/vendor-dependencies/${dependencyId}`),
};

