import { LoadingState } from '@/components/ui/state';

interface DashboardLoadingStateProps {
    label: string;
}

export function DashboardLoadingState({ label }: DashboardLoadingStateProps) {
    return <LoadingState layout="page" label={label} />;
}
