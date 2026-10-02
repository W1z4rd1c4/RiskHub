import type { Tone } from '@/lib/tones';
import type { ApprovalActionType, ApprovalStatus } from '@/types/approval';

/** Status pill tone (D1/§4.4: meaning only; `Badge` maps the tone to token classes). */
export function getApprovalStatusTone(status: ApprovalStatus): Tone {
    switch (status) {
        case 'pending':
            return 'warning';
        case 'pending_privileged':
            return 'accent';
        case 'approved':
            return 'success';
        case 'rejected':
            return 'danger';
        case 'expired':
        case 'cancelled':
        default:
            return 'neutral';
    }
}

/** Request-type pill tone. */
export function getApprovalActionTone(action: ApprovalActionType): Tone {
    switch (action) {
        case 'delete':
        case 'archive':
            return 'danger';
        case 'create':
            return 'success';
        case 'edit':
            return 'info';
        default:
            return 'neutral';
    }
}

export type GovernedActionLabel = 'create' | 'update' | 'archive' | 'link_add' | 'link_update' | 'link_remove';

export function getGovernedActionLabel(
    actionType: ApprovalActionType,
    mutationKind?: string | null,
): GovernedActionLabel {
    if (mutationKind?.startsWith('vendor.link.') || mutationKind?.startsWith('asset.link.')) {
        if (mutationKind.endsWith('.add')) return 'link_add';
        if (mutationKind.endsWith('.remove')) return 'link_remove';
    }
    if (
        mutationKind === 'vendor.create'
        || mutationKind === 'vendor.contract.create'
        || mutationKind === 'vendor.sub_outsourcing.create'
    ) return 'create';
    if (
        mutationKind === 'vendor.archive'
        || mutationKind === 'vendor.contract.archive'
        || mutationKind === 'vendor.sub_outsourcing.archive'
    ) return 'archive';
    switch (mutationKind) {
        case 'process.create':
            return 'create';
        case 'process.archive':
            return 'archive';
        case 'process.link.risk.add':
        case 'process.link.asset.add':
        case 'process.link.vendor.add':
            return 'link_add';
        case 'process.link.asset.update':
            return 'link_update';
        case 'process.link.risk.remove':
        case 'process.link.asset.remove':
        case 'process.link.vendor.remove':
            return 'link_remove';
        case null:
        case undefined:
            break;
    }
    if (actionType === 'create') return 'create';
    if (actionType === 'archive' || actionType === 'delete') return 'archive';
    return 'update';
}
