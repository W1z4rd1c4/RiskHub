import { RefreshCw } from 'lucide-react';

import { Button, type ButtonVariant } from '@/components/ui/button';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

/**
 * Refresh affordance for registers and panels (audit §4.7, FB-02).
 *
 * While `isFetching` the icon spins and the control reports `aria-busy`. It
 * stays focusable (`aria-disabled`, not `disabled`) so keyboard focus is not
 * lost mid-refresh, and repeat activations are ignored until the fetch ends.
 * The accessible name defaults to the translated `common:actions.refresh`.
 */
export interface RefreshButtonProps {
    onRefresh: () => void;
    isFetching?: boolean;
    /** Accessible name (and visible text unless `iconOnly`). */
    label?: string;
    /** Render as an icon-only square; the label becomes `aria-label` + `title`. */
    iconOnly?: boolean;
    variant?: Extract<ButtonVariant, 'secondary' | 'outline' | 'ghost'>;
    /** Same scale as `BackButton`: `compact` is the 32px control. */
    size?: 'default' | 'compact';
    className?: string;
    'data-testid'?: string;
}

export function RefreshButton({
    onRefresh,
    isFetching = false,
    label,
    iconOnly = false,
    variant = 'secondary',
    size = 'default',
    className,
    'data-testid': testId,
}: RefreshButtonProps) {
    const { t } = useTranslation('common');
    const name = label ?? t('actions.refresh');

    const handleClick = () => {
        if (isFetching) return;
        onRefresh();
    };

    const icon = <RefreshCw aria-hidden="true" className={cn(isFetching && 'animate-spin')} />;
    const shared = {
        variant,
        onClick: handleClick,
        className,
        'aria-busy': isFetching,
        'aria-disabled': isFetching || undefined,
        'data-testid': testId,
    } as const;

    if (iconOnly) {
        return (
            <Button {...shared} size={size === 'compact' ? 'iconCompact' : 'icon'} aria-label={name} title={name}>
                {icon}
            </Button>
        );
    }

    return (
        <Button {...shared} size={size}>
            {icon}
            {name}
        </Button>
    );
}
