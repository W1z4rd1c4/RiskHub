/** A read-only label/value pair inside a `<dl>` (§4.5: `<dt>/<dd>`, never `<label>`). */
export function IssueMetaBlock({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-border bg-nested px-4 py-3 space-y-1">
            <dt className="text-eyebrow">{label}</dt>
            <dd className="text-sm text-foreground break-words">{value}</dd>
        </div>
    );
}
