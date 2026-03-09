import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import './vendorRoute.css';

type VendorSurfaceElement = 'article' | 'div' | 'section';
type VendorSurfaceTone = 'default' | 'emphasis' | 'muted';
type VendorButtonVariant = 'danger' | 'ghost' | 'primary' | 'secondary' | 'success';
type VendorBadgeTone = 'danger' | 'info' | 'neutral' | 'success' | 'warn';
type VendorMessageTone = 'danger' | 'success' | 'neutral' | 'warn';

interface VendorSurfaceProps extends HTMLAttributes<HTMLElement> {
    as?: VendorSurfaceElement;
    compact?: boolean;
    flush?: boolean;
    tone?: VendorSurfaceTone;
}

interface VendorSectionHeaderProps {
    actions?: ReactNode;
    className?: string;
    description?: ReactNode;
    icon?: ReactNode;
    title: ReactNode;
}

interface VendorActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: VendorButtonVariant;
}

interface VendorBadgeProps extends HTMLAttributes<HTMLSpanElement> {
    tone?: VendorBadgeTone;
}

interface VendorEmptyStateProps {
    action?: ReactNode;
    description?: ReactNode;
    icon?: ReactNode;
    title: ReactNode;
}

interface VendorInlineMessageProps extends HTMLAttributes<HTMLDivElement> {
    tone?: VendorMessageTone;
}

export function VendorSurface({
    as = 'section',
    children,
    className,
    compact = false,
    flush = false,
    tone = 'default',
    ...props
}: VendorSurfaceProps) {
    const Component = as;

    return (
        <Component
            className={cn(
                'vendor-surface',
                tone === 'muted' && 'vendor-surface--muted',
                tone === 'emphasis' && 'vendor-surface--emphasis',
                compact && 'vendor-surface--compact',
                flush && 'vendor-surface--flush',
                className,
            )}
            {...props}
        >
            {children}
        </Component>
    );
}

export function VendorSectionHeader({
    actions,
    className,
    description,
    icon,
    title,
}: VendorSectionHeaderProps) {
    return (
        <div className={cn('vendor-section-header', className)}>
            <div className="vendor-section-header__body">
                {icon ? <div className="vendor-section-header__icon">{icon}</div> : null}
                <div className="vendor-section-header__copy">
                    <h2 className="vendor-section-title">{title}</h2>
                    {description ? <p className="vendor-section-description">{description}</p> : null}
                </div>
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
    );
}

export function VendorActionButton({
    children,
    className,
    type = 'button',
    variant = 'secondary',
    ...props
}: VendorActionButtonProps) {
    return (
        <button
            type={type}
            className={cn(
                'vendor-button',
                variant === 'primary' && 'vendor-button--primary',
                variant === 'danger' && 'vendor-button--danger',
                variant === 'success' && 'vendor-button--success',
                variant === 'ghost' && 'vendor-button--ghost',
                className,
            )}
            {...props}
        >
            {children}
        </button>
    );
}

export function VendorBadge({ children, className, tone = 'neutral', ...props }: VendorBadgeProps) {
    return (
        <span
            className={cn(
                'vendor-badge',
                tone === 'neutral' && 'vendor-badge--neutral',
                tone === 'info' && 'vendor-badge--info',
                tone === 'success' && 'vendor-badge--success',
                tone === 'warn' && 'vendor-badge--warn',
                tone === 'danger' && 'vendor-badge--danger',
                className,
            )}
            {...props}
        >
            {children}
        </span>
    );
}

export function VendorEmptyState({ action, description, icon, title }: VendorEmptyStateProps) {
    return (
        <div className="vendor-empty-state">
            {icon ? <div className="vendor-muted">{icon}</div> : null}
            <div className="vendor-empty-state__title">{title}</div>
            {description ? <p className="vendor-empty-state__description">{description}</p> : null}
            {action}
        </div>
    );
}

export function VendorInlineMessage({
    children,
    className,
    tone = 'neutral',
    ...props
}: VendorInlineMessageProps) {
    return (
        <div
            className={cn(
                'vendor-inline-message',
                tone === 'danger' && 'vendor-inline-message--danger',
                tone === 'success' && 'vendor-inline-message--success',
                tone === 'warn' && 'vendor-inline-message--warn',
                className,
            )}
            {...props}
        >
            {children}
        </div>
    );
}
