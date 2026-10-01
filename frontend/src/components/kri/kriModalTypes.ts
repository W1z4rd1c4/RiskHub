import type { KRIUpdate, KeyRiskIndicator } from '@/types/kri';

export type KRIModalSaveResult =
    | { kind: 'updated' }
    | { kind: 'approval'; approvalId: number; message: string };

/** Edit-only modal: KRIs are created through the KRI form page, never here. */
export interface KRIModalProps {
    kri: KeyRiskIndicator;
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: KRIUpdate, vendorIds: number[]) => Promise<KRIModalSaveResult>;
}

export type KriModalFormData = Partial<KRIUpdate>;

export type KriModalTranslate = (
    key: string,
    options?: Record<string, unknown>,
) => string;

export interface KriOwnerOption {
    id: number;
    name: string;
    email: string;
}
