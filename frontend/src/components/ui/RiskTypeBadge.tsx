import { Badge } from '@/components/ui/badge';
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
        <Badge
            shape="rounded"
            title={title}
            data-testid={testId}
            className={cn('gap-1.5 rounded-lg px-2 uppercase tracking-widest text-foreground', className)}
        >
            <ColorSwatch color={color} />
            <span className="truncate">{label}</span>
        </Badge>
    );
}
