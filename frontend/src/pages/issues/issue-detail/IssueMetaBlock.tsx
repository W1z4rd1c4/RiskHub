export function IssueMetaBlock({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-border bg-tint/5 px-4 py-3 space-y-1">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className="text-sm text-foreground break-words">{value}</p>
        </div>
    );
}
