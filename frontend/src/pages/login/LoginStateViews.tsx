import { AuthFrame } from '@/components/layout/AuthFrame';
import { Button } from '@/components/ui/button';
import { InlineMessage } from '@/components/ui/inline-message';
import { Spinner } from '@/components/ui/state';

interface LoadingLoginViewProps {
    /** The page `h1` while the auth configuration loads ("Sign in"). */
    title: string;
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

/** Auth configuration still loading: the frame's polite status line carries the message. */
export function LoadingLoginView({ title, message }: LoadingLoginViewProps) {
    return (
        <AuthFrame title={title} busy status={message}>
            <div className="flex justify-center py-2">
                <Spinner size="lg" />
            </div>
        </AuthFrame>
    );
}

/** The auth configuration could not be loaded: announced error, retry, optional SSO sign-out recovery. */
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
        <AuthFrame title={title} error={message}>
            <p className="text-sm text-muted-foreground">{retryHint}</p>
            <Button variant="accent" className="w-full" onClick={onRetry}>
                {retryLabel}
            </Button>
            {recoveryMessage && onRecoveryAction ? (
                <InlineMessage
                    tone="warning"
                    action={(
                        <Button variant="outline" size="compact" onClick={onRecoveryAction} isLoading={recoveryActionPending}>
                            {recoveryActionLabel}
                        </Button>
                    )}
                >
                    {recoveryMessage}
                </InlineMessage>
            ) : null}
        </AuthFrame>
    );
}

/** No sign-in method is enabled for this environment. */
export function LoginNotConfiguredView({ title, description }: LoginNotConfiguredViewProps) {
    return (
        <AuthFrame title={title}>
            <p className="text-sm text-muted-foreground">{description}</p>
        </AuthFrame>
    );
}
