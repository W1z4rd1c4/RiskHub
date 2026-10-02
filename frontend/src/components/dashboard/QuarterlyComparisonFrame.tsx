import { Calendar } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card, CardHeader } from '@/components/ui/card';
import { LoadingState, Skeleton } from '@/components/ui/state';

interface QuarterlyComparisonFrameProps {
    children: ReactNode;
    title: string;
}

export function QuarterlyComparisonFrame({ children, title }: QuarterlyComparisonFrameProps) {
    return (
        <Card as="section">
            <CardHeader title={title} icon={Calendar} className="mb-6" />
            {children}
        </Card>
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
