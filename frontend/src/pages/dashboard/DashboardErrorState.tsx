import { ErrorState } from '@/components/ui/state';

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
        <ErrorState
            layout="page"
            title={title}
            message={detail}
            onRetry={onRetry}
            retryLabel={retryLabel}
        />
    );
}
