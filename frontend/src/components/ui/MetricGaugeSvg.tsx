import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface GaugeZone {
    startPct: number;
    endPct: number;
    className: string;
}

interface GaugeMarker {
    positionPct: number;
    className?: string;
    title?: string;
}

interface MetricGaugeSvgProps {
    valuePct: number;
    pointerClassName: string;
    className?: string;
    trackClassName?: string;
    zones?: GaugeZone[];
    markers?: GaugeMarker[];
}

function clampPercent(value: number): number {
    return Math.max(0, Math.min(100, value));
}

export function MetricGaugeSvg({
    valuePct,
    pointerClassName,
    className,
    trackClassName = 'fill-current text-white/5',
    zones = [],
    markers = [],
}: MetricGaugeSvgProps) {
    const clampedValue = clampPercent(valuePct);

    return (
        <svg viewBox="0 0 100 16" aria-hidden="true" className={cn('h-8 w-full overflow-visible', className)}>
            <rect x="0" y="7" width="100" height="2" rx="1" className={cn('fill-current', trackClassName)} />
            {zones.map((zone, index) => {
                const start = clampPercent(zone.startPct);
                const end = clampPercent(zone.endPct);
                const width = Math.max(0, end - start);
                return (
                    <rect
                        key={`${start}-${end}-${index}`}
                        x={start}
                        y="7"
                        width={width}
                        height="2"
                        rx="1"
                        className={cn('fill-current', zone.className)}
                    />
                );
            })}
            {markers.map((marker, index) => (
                <g key={`${marker.positionPct}-${index}`} className="fill-current">
                    <title>{marker.title}</title>
                    <line
                        x1={clampPercent(marker.positionPct)}
                        x2={clampPercent(marker.positionPct)}
                        y1="4"
                        y2="12"
                        className={cn('stroke-current', marker.className ?? 'text-white/20')}
                        strokeWidth="0.75"
                    />
                </g>
            ))}
            <motion.circle
                initial={false}
                animate={{ cx: clampedValue }}
                cy="8"
                r="2.5"
                className={cn('fill-current stroke-slate-900', pointerClassName)}
                strokeWidth="1.5"
                transition={{ type: 'spring', stiffness: 100 }}
            />
        </svg>
    );
}
