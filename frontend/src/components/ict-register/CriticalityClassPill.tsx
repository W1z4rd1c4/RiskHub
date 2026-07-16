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

const CRITICALITY_PILLS: Record<string, string> = {
    ['Nízká']: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    low: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    ['Střední']: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    medium: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    ['Vysoká']: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
    high: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
    ['Kritická']: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
    critical: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
};

// TierDod, verbatim workbook labels (never translated).
const VENDOR_TIER_PILLS: Record<string, string> = {
    critical: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
    significant: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
    standard: 'text-slate-300 bg-slate-400/10 border-slate-400/20',
};

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
        return <span className="text-sm text-slate-500">—</span>;
    }
    return (
        <span
            data-testid={testId}
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                palette[value] ?? 'text-slate-300 bg-slate-400/10 border-slate-400/20'
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
