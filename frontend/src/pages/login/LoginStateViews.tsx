import { Loader2 } from 'lucide-react';

interface LoadingLoginViewProps {
    message: string;
}

interface AuthConfigErrorViewProps {
    title: string;
    message: string;
    retryHint: string;
    retryLabel: string;
    onRetry: () => void;
}

interface LoginNotConfiguredViewProps {
    title: string;
    description: string;
}

export function LoadingLoginView({ message }: LoadingLoginViewProps) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
            <div className="flex items-center gap-2 text-sm text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                {message}
            </div>
        </div>
    );
}

export function AuthConfigErrorView({
    title,
    message,
    retryHint,
    retryLabel,
    onRetry,
}: AuthConfigErrorViewProps) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-4">
            <div className="w-full max-w-md text-center space-y-4">
                <h1 className="text-xl font-bold mb-2">{title}</h1>
                <p className="text-sm text-slate-300">{message}</p>
                <p className="text-sm text-slate-500">{retryHint}</p>
                <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/[0.08]"
                >
                    {retryLabel}
                </button>
            </div>
        </div>
    );
}

export function LoginNotConfiguredView({ title, description }: LoginNotConfiguredViewProps) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-4">
            <div className="w-full max-w-md text-center">
                <h1 className="text-xl font-bold mb-2">{title}</h1>
                <p className="text-sm text-slate-300">{description}</p>
            </div>
        </div>
    );
}
