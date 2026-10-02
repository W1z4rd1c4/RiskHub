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

import { criticalityClass, vendorTierClass } from '@/lib/severity';
import { cn } from '@/lib/utils';

// Colours come only from the severity SSOT (lib/severity.ts, ADR-015 Addendum 1
// §2). TridyKrit criticality keeps its 3-step collapse on solid D1 fills (Nízká
// → success, Střední and Vysoká → warning, Kritická → destructive), with the
// label text carrying the exact band; TierDod tiers use soft badges (critical →
// danger, significant → the medium band, standard → neutral, PM-3).
const criticalityPillClass = (value: string): string | null => {
    const fill = criticalityClass('fill', value);
    return fill ? cn(fill, 'border-transparent') : null;
};
const vendorTierPillClass = (value: string): string | null => vendorTierClass('badge', value);

function Pill({
    displayValue,
    value,
    palette,
    testId,
}: {
    displayValue?: string | null;
    value: string | null | undefined;
    palette: (value: string) => string | null;
    testId?: string;
}) {
    if (!value) {
        return <span className="text-sm text-muted-foreground">—</span>;
    }
    return (
        <span
            data-testid={testId}
            className={cn(
                // The `Badge` md geometry; colours come from lib/severity.ts (D1).
                'inline-flex h-6 items-center whitespace-nowrap rounded-full border px-2.5 text-xs font-bold',
                palette(value) ?? 'bg-muted text-muted-foreground border-border',
            )}
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
    return <Pill value={criticalityClass} displayValue={displayValue} palette={criticalityPillClass} />;
}

/** Canonical derived Vendor tier, rendered with a separately localized label. */
export function VendorTierPill({ tier, displayValue, testId }: { tier: string | null | undefined; displayValue?: string | null; testId?: string }) {
    return <Pill value={tier} displayValue={displayValue} palette={vendorTierPillClass} testId={testId} />;
}
