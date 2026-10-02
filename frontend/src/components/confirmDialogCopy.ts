import { AlertTriangle, Archive, Send, Trash2, Unlink, type LucideIcon } from 'lucide-react';

import type { DialogFooterIntent, DialogTone } from '@/components/ui/dialog';
import type { SafeTFunction } from '@/i18n/hooks';

/**
 * ConfirmDialog intents (audit 2026-09-30 §4.11, D10, PG-07).
 *
 * - `archive`: reversible. `Archive` icon and the word "Archive", never `Trash2`
 *   or "Delete".
 * - `delete`: irreversible only. `Trash2`.
 * - `unlink`: removes a link, not the record. `Unlink` + "Remove link".
 * - `send`: outbound (bulk) send. `Send`, accent action, count-aware title.
 * - `discard`: drop unsaved input (dirty guard).
 * - `revoke`: withdraw access or a pending request (revoke a session,
 *   deactivate a user, cancel an approval or a pending change). Reversible by
 *   granting / requesting again, so `AlertTriangle` + warning action, never
 *   `Trash2`; the caller supplies the copy.
 * - `generic`: a non-destructive confirmation with caller-supplied copy
 *   (accent action, info tone).
 */
export type ConfirmIntent = 'archive' | 'delete' | 'unlink' | 'send' | 'discard' | 'revoke' | 'generic';

/**
 * Reason policy (PM-1): show a reason field when the module's API accepts one;
 * it is `required` iff the action is routed through approval, else `optional`.
 */
export type ConfirmReasonPolicy = 'none' | 'optional' | 'required';

export interface ConfirmPresentation {
    icon: LucideIcon;
    tone: DialogTone;
    action: DialogFooterIntent;
}

export function confirmPresentation(intent: ConfirmIntent): ConfirmPresentation {
    switch (intent) {
        case 'archive':
            return { icon: Archive, tone: 'danger', action: 'destructive' };
        case 'delete':
            return { icon: Trash2, tone: 'danger', action: 'destructive' };
        case 'unlink':
            return { icon: Unlink, tone: 'danger', action: 'destructive' };
        case 'send':
            return { icon: Send, tone: 'default', action: 'accent' };
        case 'discard':
        case 'revoke':
            return { icon: AlertTriangle, tone: 'warning', action: 'warning' };
        case 'generic':
            return { icon: AlertTriangle, tone: 'info', action: 'accent' };
    }
}

export interface ConfirmCopyInput {
    intent: ConfirmIntent;
    entityLabel?: string;
    entityName?: string;
    count?: number;
}

export interface ConfirmCopy {
    title: string;
    message: string;
    confirmLabel: string;
    busyLabel: string;
    reasonLabel: string;
    reasonPlaceholder: string;
}

/** Default copy per intent (`common:confirm.*`); every field can be overridden by props. */
export function resolveConfirmCopy(
    t: SafeTFunction,
    { intent, entityLabel, entityName, count }: ConfirmCopyInput,
): ConfirmCopy {
    const reasonLabel = t('confirm.reason.label');
    const reasonPlaceholder = t('confirm.reason.placeholder');

    switch (intent) {
        case 'archive':
            return {
                title: count !== undefined
                    ? t('confirm.archive.title_count', { count })
                    : entityLabel ? t('confirm.archive.title', { entity: entityLabel }) : t('confirm.archive.title_generic'),
                message: t('confirmation.archive_reversible'),
                confirmLabel: t('actions.archive'),
                busyLabel: t('confirm.archive.busy'),
                reasonLabel: t('labels.archive_reason'),
                reasonPlaceholder: t('confirm.archive.reason_placeholder'),
            };
        case 'delete':
            return {
                title: count !== undefined
                    ? t('confirm.delete.title_count', { count })
                    : entityLabel ? t('confirm.delete.title', { entity: entityLabel }) : t('confirm.delete.title_generic'),
                message: t('confirm.delete.body'),
                confirmLabel: t('actions.delete'),
                busyLabel: t('confirm.delete.busy'),
                reasonLabel,
                reasonPlaceholder,
            };
        case 'unlink':
            return {
                title: count !== undefined
                    ? t('confirm.unlink.title_count', { count })
                    : entityName ? t('confirm.unlink.title', { name: entityName }) : t('confirm.unlink.title_generic'),
                message: t('confirm.unlink.body'),
                confirmLabel: t('actions.remove_link'),
                busyLabel: t('confirm.unlink.busy'),
                reasonLabel,
                reasonPlaceholder,
            };
        case 'send':
            return {
                title: count !== undefined
                    ? t('confirm.send.title_count', { count })
                    : entityLabel ? t('confirm.send.title', { entity: entityLabel }) : t('confirm.send.title_generic'),
                message: t('confirm.send.body'),
                confirmLabel: t('actions.send'),
                busyLabel: t('confirm.send.busy'),
                reasonLabel,
                reasonPlaceholder,
            };
        case 'discard':
            return {
                title: t('confirm.discard.title'),
                message: t('confirm.discard.body'),
                confirmLabel: t('actions.discard'),
                busyLabel: t('labels.loading'),
                reasonLabel,
                reasonPlaceholder,
            };
        case 'revoke':
        case 'generic':
            return {
                title: t('confirm.generic.title'),
                message: '',
                confirmLabel: t('actions.confirm'),
                busyLabel: t('labels.loading'),
                reasonLabel,
                reasonPlaceholder: t('labels.notes'),
            };
    }
}
