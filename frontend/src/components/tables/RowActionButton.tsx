import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Icon-only row action for table rows (audit §4.7 / §4.13, GAP-B-03).
 *
 * - `label` is required and becomes the accessible name and the tooltip.
 * - `disabledReason` keeps the action visible and focusable but inert
 *   (`aria-disabled`), and explains why through the tooltip, which is also
 *   exposed as the accessible description. Prefer it over hiding the action
 *   or a bare `disabled` with a generic title.
 * - Clicks and Enter/Space never bubble to the row, so a row action does not
 *   also trigger row activation.
 */
export interface RowActionButtonProps {
    icon: LucideIcon;
    label: string;
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
    /** When set, the action is inert and this text explains why. */
    disabledReason?: string;
    /** `danger` for destructive row actions (delete, remove). */
    tone?: 'default' | 'danger';
    /** The action is in flight: the icon becomes the button spinner and the button is disabled. */
    isLoading?: boolean;
    className?: string;
    'data-testid'?: string;
}

export const RowActionButton = React.forwardRef<HTMLButtonElement, RowActionButtonProps>(
    ({ icon: Icon, label, onClick, disabledReason, tone = 'default', isLoading = false, className, 'data-testid': testId }, ref) => {
        const isDisabled = Boolean(disabledReason);

        const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            if (isDisabled) {
                event.preventDefault();
                return;
            }
            onClick(event);
        };

        const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.stopPropagation();
            }
        };

        return (
            <Button
                ref={ref}
                variant="ghost"
                size="iconCompact"
                aria-label={label}
                aria-disabled={isDisabled || undefined}
                title={disabledReason ?? label}
                isLoading={isLoading}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                data-testid={testId}
                className={cn(
                    'text-muted-foreground',
                    tone === 'danger' && 'hover:bg-destructive/10 hover:text-destructive',
                    className,
                )}
            >
                <Icon aria-hidden="true" />
            </Button>
        );
    },
);
RowActionButton.displayName = 'RowActionButton';
