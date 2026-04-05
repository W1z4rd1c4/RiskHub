import { cn } from '@/lib/utils';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

interface ColorSwatchProps {
    color?: string | null;
    toneClassName?: string;
    className?: string;
    title?: string;
}

export function ColorSwatch({ color, toneClassName, className, title }: ColorSwatchProps) {
    const normalizedColor = typeof color === 'string' && HEX_COLOR_PATTERN.test(color) ? color : null;

    return (
        <svg
            viewBox="0 0 12 12"
            aria-hidden="true"
            title={title}
            className={cn('inline-block h-3 w-3 shrink-0', className)}
        >
            <rect
                x="1"
                y="1"
                width="10"
                height="10"
                rx="2"
                stroke="currentColor"
                strokeWidth="1"
                fill={normalizedColor ?? 'currentColor'}
                className={normalizedColor ? 'text-white/20' : cn('fill-current', toneClassName ?? 'text-slate-400')}
            />
        </svg>
    );
}
