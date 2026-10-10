import type { ReactNode } from 'react';

import { Card, CardHeader, type CardHeaderProps } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface DetailSectionProps {
    /** Section title, rendered as the card's `h2`. */
    title: ReactNode;
    /** Optional icon / description / actions of the card header. */
    icon?: CardHeaderProps['icon'];
    description?: CardHeaderProps['description'];
    actions?: CardHeaderProps['actions'];
    children: ReactNode;
    testId?: string;
    className?: string;
}

/**
 * A titled section card on an entity detail page (audit 2026-09-30 §4.10,
 * §4.14): a `Card` (D5) with a `CardHeader` whose title is the section `h2`.
 * Put `DetailFieldList` / `DetailField` rows or a link list inside.
 */
export function DetailSection({ title, icon, description, actions, children, testId, className }: DetailSectionProps) {
    return (
        <Card as="section" data-testid={testId} className={cn('min-w-0', className)}>
            <CardHeader title={title} icon={icon} description={description} actions={actions} />
            {children}
        </Card>
    );
}
