import { getControlEffectivenessMeta } from '@/lib/monitoringStatus';
import type { StatusTone } from '@/lib/tones';

import type { ExistingLinkItem, LinkMode } from './linkTypes';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

/**
 * Link effectiveness badge (PG-03, PG-19): the tone and translated label of a
 * high / medium / low outcome rating. Vendor-to-KRI links carry the placeholder
 * `linked`, which has no rating and shows no badge.
 */
export function getExistingLinkEffectivenessMeta(
    effectiveness: string,
    t: TranslateFn,
): { label: string; tone: StatusTone } | null {
    const meta = getControlEffectivenessMeta(effectiveness);
    return meta.labelKey ? { label: t(meta.labelKey), tone: meta.tone } : null;
}

function getRiskDescription(risk: unknown): string | null {
    if (!risk || typeof risk !== 'object' || !('description' in risk)) {
        return null;
    }
    const description = (risk as { description?: unknown }).description;
    return typeof description === 'string' && description.length > 0 ? description : null;
}

function getControlName(control: unknown): string | null {
    if (!control || typeof control !== 'object' || !('name' in control)) {
        return null;
    }
    const name = (control as { name?: unknown }).name;
    return typeof name === 'string' && name.length > 0 ? name : null;
}

export function getExistingLinkTargetId(link: ExistingLinkItem, mode: LinkMode): number {
    switch (mode) {
        case 'control-to-risk':
            return Number(link.risk_id);
        case 'risk-to-control':
            return Number(link.control_id);
        case 'vendor-to-kri':
            return Number(link.kri_id);
    }
}

export function getExistingLinkDisplayName(
    link: ExistingLinkItem,
    mode: LinkMode,
    t: TranslateFn,
): string {
    if (link.display_name) {
        return link.display_name;
    }
    if (mode === 'control-to-risk') {
        return getRiskDescription(link.risk) || t('common:labels.unknown');
    }
    if (mode === 'vendor-to-kri') {
        return t('common:labels.unknown');
    }
    return getControlName(link.control) || t('common:labels.unknown');
}
