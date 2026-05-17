import { ColorSwatch } from '@/components/ui/ColorSwatch';
import { cn } from '@/lib/utils';

interface RiskTypeBadgeProps {
    label: string;
    color?: string | null;
    title?: string;
    className?: string;
    testId?: string;
}

export function RiskTypeBadge({ label, color, title, className, testId }: RiskTypeBadgeProps) {
    return (
        <span
            title={title}
            data-testid={testId}
            className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-white',
                className,
            )}
        >
            <ColorSwatch color={color} />
            <span className="truncate">{label}</span>
        </span>
    );
}
