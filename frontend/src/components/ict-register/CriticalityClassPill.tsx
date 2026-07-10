/**
 * Workbook TridyKrit pill (ICT Register): Nízká / Střední / Vysoká / Kritická.
 *
 * One shared read-only rendering for every register surface that shows a
 * criticality class — the Process and Asset register columns and the
 * engine-derived detail blocks (ticket #48). Component-only module so the
 * react-refresh rule stays satisfied.
 */

const CRITICALITY_PILLS: Record<string, string> = {
    ['Nízká']: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    ['Střední']: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    ['Vysoká']: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
    ['Kritická']: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
};

export function CriticalityClassPill({
    criticalityClass,
}: {
    criticalityClass: string | null | undefined;
}) {
    if (!criticalityClass) {
        return <span className="text-sm text-slate-500">—</span>;
    }
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                CRITICALITY_PILLS[criticalityClass] ?? 'text-slate-300 bg-slate-400/10 border-slate-400/20'
            }`}
        >
            {criticalityClass}
        </span>
    );
}
