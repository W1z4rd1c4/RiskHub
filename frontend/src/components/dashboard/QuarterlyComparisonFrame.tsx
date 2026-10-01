import { Calendar } from 'lucide-react';
import type { ReactNode } from 'react';

import { LoadingState, Skeleton } from '@/components/ui/state';

interface QuarterlyComparisonFrameProps {
    children: ReactNode;
    title: string;
}

export function QuarterlyComparisonFrame({ children, title }: QuarterlyComparisonFrameProps) {
    return (
        <div className="glass-card">
            <div className="flex items-center gap-2 mb-6">
                <Calendar className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-bold text-foreground">{title}</h3>
            </div>
            {children}
        </div>
    );
}

export function QuarterlyComparisonSkeleton({ title }: { title: string }) {
    return (
        <QuarterlyComparisonFrame title={title}>
            <LoadingState
                skeleton={(
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {Array(6).fill(0).map((_, index) => (
                            <Skeleton key={index} className="h-24 rounded-xl" />
                        ))}
                    </div>
                )}
            />
        </QuarterlyComparisonFrame>
    );
}
