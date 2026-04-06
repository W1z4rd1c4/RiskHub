import type { KRICreate } from '@/types/kri';

export interface KRIFormVendorContext {
    vendorId: number;
    vendorName?: string;
    returnTo: string;
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
