import * as React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, type To } from 'react-router-dom';

import { Button, buttonVariants, type ButtonVariant } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Labelled back navigation (audit §4.7 / §4.14, D14, AX-06).
 *
 * The visible text and the accessible name are the same `label`, and the
 * label must name the destination ("Back to Risks", "Back to {{name}}"),
 * never a bare "Back". Pass `to` for route navigation (renders a link) or
 * `onClick` when the destination is computed at click time (renders a button).
 */
interface BackButtonBaseProps {
    /** Destination-naming label, e.g. `t('actions.back_to_register')`. */
    label: string;
    className?: string;
    variant?: Extract<ButtonVariant, 'secondary' | 'outline' | 'ghost' | 'link'>;
    size?: 'default' | 'compact';
    'data-testid'?: string;
}

interface BackLinkProps extends BackButtonBaseProps {
    to: To;
    /** Forwarded to the router link, e.g. to preserve register state. */
    state?: unknown;
    onClick?: never;
}

interface BackActionProps extends BackButtonBaseProps {
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
    to?: never;
    state?: never;
}

export type BackButtonProps = BackLinkProps | BackActionProps;

export function BackButton(props: BackButtonProps) {
    const { label, className, variant = 'secondary', size = 'default' } = props;
    const icon = <ArrowLeft aria-hidden="true" />;

    if (props.to !== undefined) {
        return (
            <Link
                to={props.to}
                state={props.state}
                className={cn(buttonVariants({ variant, size }), className)}
                data-testid={props['data-testid']}
            >
                {icon}
                {label}
            </Link>
        );
    }

    return (
        <Button
            variant={variant}
            size={size}
            onClick={props.onClick}
            className={className}
            data-testid={props['data-testid']}
        >
            {icon}
            {label}
        </Button>
    );
}
