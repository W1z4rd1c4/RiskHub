import { ShieldAlert } from 'lucide-react';

interface DashboardErrorStateProps {
    detail: string;
    onRetry: () => void;
    retryLabel: string;
    title: string;
}

export function DashboardErrorState({
    detail,
    onRetry,
    retryLabel,
    title,
}: DashboardErrorStateProps) {
    return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="glass-card p-10 flex flex-col items-center text-center max-w-md">
                <ShieldAlert className="h-12 w-12 text-rose-500 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                <p className="text-slate-500 mb-6">{detail}</p>
                <button
                    onClick={onRetry}
                    className="px-6 py-2 bg-accent text-white rounded-xl font-bold hover:bg-accent/80 transition-all"
                >
                    {retryLabel}
                </button>
            </div>
        </div>
    );
}
