import { RefreshCw } from 'lucide-react';

interface DashboardLoadingStateProps {
    label: string;
}

export function DashboardLoadingState({ label }: DashboardLoadingStateProps) {
    return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="flex flex-col items-center gap-4">
                <RefreshCw className="h-8 w-8 text-accent animate-spin" />
                <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">{label}</p>
            </div>
        </div>
    );
}
