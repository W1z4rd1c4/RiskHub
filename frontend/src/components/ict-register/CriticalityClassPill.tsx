/**
 * Workbook closed-list pills (ICT Register).
 *
 * One shared read-only rendering for every register surface that shows a
 * TridyKrit criticality class (Nízká / Střední / Vysoká / Kritická — the
 * Process and Asset register columns and the engine-derived detail blocks,
 * ticket #48) or a TierDod vendor tier (Kritický / Významný / Standardní
 * dodavatel — the Vendor derived section, ticket #49). Component-only module
 * so the react-refresh rule stays satisfied.
 */

import { VENDOR_TIERS, vendorTierClass } from '@/lib/severity';

// Semantic status tokens (ADR-015): each pill pairs a token background with its
// contract-tested foreground (statusTokenContrast.test.ts), matching the
// committee pill migration (FR-P5-1). The four bands collapse onto the
// three-token RAG scale — the amber Střední and orange Vysoká middles both read
// amber (--warning) — with the label text still carrying the exact band.
const FILL_SUCCESS = 'bg-success text-success-foreground border-transparent';
const FILL_WARNING = 'bg-warning text-warning-foreground border-transparent';
const FILL_DESTRUCTIVE = 'bg-destructive text-destructive-foreground border-transparent';

const CRITICALITY_PILLS: Record<string, string> = {
    ['Nízká']: FILL_SUCCESS,
    low: FILL_SUCCESS,
    ['Střední']: FILL_WARNING,
    medium: FILL_WARNING,
    ['Vysoká']: FILL_WARNING,
    high: FILL_WARNING,
    ['Kritická']: FILL_DESTRUCTIVE,
    critical: FILL_DESTRUCTIVE,
};

// TierDod tiers take their badge tone from the severity SSOT (lib/severity.ts,
// D1 + PM-3: critical → danger, significant → the medium band, standard → neutral).
const VENDOR_TIER_PILLS: Record<string, string> = Object.fromEntries(
    VENDOR_TIERS.map((tier) => [tier, vendorTierClass('badge', tier) ?? '']),
);

function Pill({
    displayValue,
    value,
    palette,
    testId,
}: {
    displayValue?: string | null;
    value: string | null | undefined;
    palette: Record<string, string>;
    testId?: string;
}) {
    if (!value) {
        return <span className="text-sm text-muted-foreground">—</span>;
    }
    return (
        <span
            data-testid={testId}
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                palette[value] ?? 'bg-muted text-muted-foreground border-border'
            }`}
        >
            {displayValue ?? value}
        </span>
    );
}

export function CriticalityClassPill({
    criticalityClass,
    displayValue,
}: {
    criticalityClass: string | null | undefined;
    displayValue?: string | null;
}) {
    return <Pill value={criticalityClass} displayValue={displayValue} palette={CRITICALITY_PILLS} />;
}

/** Canonical derived Vendor tier, rendered with a separately localized label. */
export function VendorTierPill({ tier, displayValue, testId }: { tier: string | null | undefined; displayValue?: string | null; testId?: string }) {
    return <Pill value={tier} displayValue={displayValue} palette={VENDOR_TIER_PILLS} testId={testId} />;
}
