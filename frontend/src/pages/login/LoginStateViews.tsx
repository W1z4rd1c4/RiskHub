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
    recoveryMessage?: string | null;
    recoveryActionLabel?: string;
    recoveryActionPending?: boolean;
    onRecoveryAction?: () => void;
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
    recoveryMessage = null,
    recoveryActionLabel,
    recoveryActionPending = false,
    onRecoveryAction,
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
                {recoveryMessage && onRecoveryAction ? (
                    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-4 text-left text-sm leading-6 text-amber-100">
                        <p>{recoveryMessage}</p>
                        <button
                            type="button"
                            onClick={onRecoveryAction}
                            disabled={recoveryActionPending}
                            className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300/30 bg-amber-100/10 px-4 py-2 text-sm font-semibold text-amber-50 transition-colors hover:bg-amber-100/20 disabled:opacity-60"
                        >
                            {recoveryActionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {recoveryActionLabel}
                        </button>
                    </div>
                ) : null}
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
