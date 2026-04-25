import { cn } from '@/lib/utils';

import type { ExistingLinkItem, LinkMode } from './linkTypes';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export function getEffectivenessClassName(effectiveness: string): string {
    switch (effectiveness) {
        case 'high':
            return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
        case 'medium':
            return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
        case 'low':
            return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
        default:
            return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
    }
}

export function getMetadataBadgeClassName(effectiveness: string): string {
    return cn(
        'px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border font-mono',
        getEffectivenessClassName(effectiveness),
    );
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
