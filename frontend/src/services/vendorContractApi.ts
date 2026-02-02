import { apiClient } from './apiClient';
import type {
    VendorContractControlsResponse,
    VendorContractControlUpdate,
} from '@/types/vendorContract';

export const vendorContractApi = {
    getContractControls: (vendorId: number) =>
        apiClient.get<VendorContractControlsResponse>(`/vendors/${vendorId}/contract-controls`),

    updateContractControls: (vendorId: number, updates: VendorContractControlUpdate[]) =>
        apiClient.patch<VendorContractControlsResponse>(`/vendors/${vendorId}/contract-controls`, { updates }),
};

