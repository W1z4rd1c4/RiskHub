import {
    AlertOctagon,
    AlertTriangle,
    Building2,
    ClipboardList,
    Handshake,
    HelpCircle,
    Server,
    ShieldAlert,
    Target,
    Workflow,
    type LucideIcon,
} from 'lucide-react';

/**
 * The one entity-to-icon map (audit 2026-09-30 NAV-03).
 *
 * Every surface that shows a register entity - sidebar routes, the Governance
 * stat cards and orphan table, department tiles, notification and history
 * rows - takes its icon from here, so "Risk" is the same glyph everywhere and
 * no two entities share one. Navigation-only destinations that are not
 * entities (Admin console, Governance, Activity log) pick their own icons in
 * `routing/`, distinct from every entry below.
 */
export const ENTITY_ICONS = {
    risk: ShieldAlert,
    control: ClipboardList,
    kri: Target,
    issue: AlertOctagon,
    threat: AlertTriangle,
    process: Workflow,
    asset: Server,
    vendor: Handshake,
    department: Building2,
} as const satisfies Record<string, LucideIcon>;

export type EntityIconKey = keyof typeof ENTITY_ICONS;

/**
 * The same map keyed by a backend `item_type` / `entity_type` string. Look up with
 * `ENTITY_ICON_BY_TYPE[type] ?? ENTITY_ICON_FALLBACK` (a plain property read, so the
 * icon can be rendered as a component) for types this map does not know yet.
 */
export const ENTITY_ICON_BY_TYPE: Readonly<Record<string, LucideIcon>> = ENTITY_ICONS;
export const ENTITY_ICON_FALLBACK: LucideIcon = HelpCircle;
