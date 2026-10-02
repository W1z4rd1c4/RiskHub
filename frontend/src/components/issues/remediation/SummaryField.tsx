/** A read-only label/value pair (render inside a `<dl>`; §4.5: `<dt>/<dd>`, never `<label>`). */
export function SummaryField({ label, value }: { label: string; value: string }) {
    return (
        <div className="space-y-1">
            <dt className="text-eyebrow">{label}</dt>
            <dd className="text-sm text-foreground break-words">{value}</dd>
        </div>
    );
}
