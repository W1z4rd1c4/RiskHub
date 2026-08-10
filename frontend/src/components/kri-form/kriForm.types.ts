import type { KRICreate } from '@/types/kri';

export interface KRIFormVendorContext {
    vendorId: number;
    vendorName?: string;
    returnTo: string;
    /**
     * Backend-declared `protected_change_requires_approval` Vendor capability.
     * A protected Vendor is excluded from the direct create payload and linked
     * through the governed vendor.link.kri.add route instead (#100).
     */
    protectedChangeRequiresApproval?: boolean;
}

export interface KRIFormProps {
    initialData?: Partial<KRICreate>;
    isEdit?: boolean;
    kriId?: number;
    onSuccess?: (kriId: number) => void | Promise<void>;
    onCancel?: () => void;
    firstStepBackLabel?: string;
    vendorContext?: KRIFormVendorContext | null;
    initialLinkedVendorIds?: number[];
}

export interface KriVisibleUser {
    id: number;
    name: string;
    email: string;
}
