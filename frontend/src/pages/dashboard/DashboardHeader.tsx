import { FileText } from 'lucide-react';

interface DashboardHeaderProps {
    canExport: boolean;
    onExport: () => void;
    subtitle: string;
    title: string;
    exportLabel: string;
    liveDataLabel: string;
}

export function DashboardHeader({
    canExport,
    onExport,
    subtitle,
    title,
    exportLabel,
    liveDataLabel,
}: DashboardHeaderProps) {
    return (
        <div className="flex justify-between items-end">
            <div>
                <h2 className="text-3xl font-black text-white mb-2">{title}</h2>
                <p className="text-slate-500 font-medium">{subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
                {canExport ? (
                    <button
                        onClick={onExport}
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-accent hover:bg-accent/10 transition-colors"
                        title={exportLabel}
                    >
                        <FileText className="h-5 w-5" />
                    </button>
                ) : null}
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {liveDataLabel}
                </div>
            </div>
        </div>
    );
}
