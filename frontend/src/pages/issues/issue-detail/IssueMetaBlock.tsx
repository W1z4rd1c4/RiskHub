export function IssueMetaBlock({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 space-y-1">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
            <p className="text-sm text-slate-300 break-words">{value}</p>
        </div>
    );
}
