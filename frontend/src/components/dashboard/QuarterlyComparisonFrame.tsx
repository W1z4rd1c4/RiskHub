import { Calendar } from 'lucide-react';
import type { ReactNode } from 'react';

interface QuarterlyComparisonFrameProps {
    children: ReactNode;
    title: string;
}

export function QuarterlyComparisonFrame({ children, title }: QuarterlyComparisonFrameProps) {
    return (
        <div className="glass-card">
            <div className="flex items-center gap-2 mb-6">
                <Calendar className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-bold text-white">{title}</h3>
            </div>
            {children}
        </div>
    );
}

export function QuarterlyComparisonSkeleton({ title }: { title: string }) {
    return (
        <QuarterlyComparisonFrame title={title}>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {Array(6).fill(0).map((_, index) => (
                    <div key={index} className="animate-pulse bg-white/5 rounded-xl h-24" />
                ))}
            </div>
        </QuarterlyComparisonFrame>
    );
}
