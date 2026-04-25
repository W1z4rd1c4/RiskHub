import type { KRICreate, KRIUpdate, KeyRiskIndicator } from '@/types/kri';

export type KRIModalSaveResult =
    | { kind: 'updated' }
    | { kind: 'approval'; approvalId: number; message: string };

export interface KRIModalProps {
    risk_id: number;
    kri?: KeyRiskIndicator | null;
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: KRICreate | KRIUpdate, vendorIds: number[]) => Promise<KRIModalSaveResult>;
    onDelete?: (id: number) => Promise<void>;
}

export type KriModalFormData = Partial<KRICreate & KRIUpdate>;

export type KriModalTranslate = (
    key: string,
    options?: Record<string, unknown>,
) => string;

export interface KriOwnerOption {
    id: number;
    name: string;
    email: string;
}
