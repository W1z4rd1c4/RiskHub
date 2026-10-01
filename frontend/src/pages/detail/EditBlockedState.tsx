import type { ReactNode } from 'react';

import type { BreadcrumbItem } from '@/components/layout/Breadcrumbs';
import { PageHeader, type PageBackTarget } from '@/components/layout/PageHeader';
import { InlineMessage } from '@/components/ui/inline-message';
import { useTranslation } from '@/i18n/hooks';

interface EditBlockedStateProps {
    /** Labelled back navigation, normally to the record ("Back to {{name}}"). */
    back: PageBackTarget;
    breadcrumbs?: readonly BreadcrumbItem[];
    /** Page `h1`; defaults to `common:edit_blocked.title`. */
    title?: string;
    /** Record name shown under the title. */
    entityName?: ReactNode;
    /** `document.title` page name; defaults to the title. */
    documentTitle?: string;
    /** Warning explaining the block; defaults to `common:edit_blocked.description`, `null` hides it. */
    reason?: ReactNode;
    /** Module detail of the block, e.g. its pending-change panel. */
    children?: ReactNode;
    /** Rendered above the header, e.g. a stale-data warning. */
    notice?: ReactNode;
    testId?: string;
}

/**
 * The edit route of a record whose business edits are blocked (pending
 * governed change, D7, SM-05, audit §4.14): one `h1` through `PageHeader`, a
 * destination-labelled back control, and the reason on warning tokens. The
 * Threat edit route uses it; Process, Asset and Vendor migrate in Phase 3d.
 */
export function EditBlockedState({
    back,
    breadcrumbs,
    title,
    entityName,
    documentTitle,
    reason,
    children,
    notice,
    testId,
}: EditBlockedStateProps) {
    const { t } = useTranslation('common');
    const resolvedTitle = title ?? t('edit_blocked.title');

    return (
        <div className="space-y-8" data-testid={testId}>
            {notice}
            <PageHeader
                title={resolvedTitle}
                documentTitle={documentTitle}
                description={entityName}
                back={back}
                breadcrumbs={breadcrumbs}
            />
            {reason === null ? null : (
                <InlineMessage tone="warning">{reason ?? t('edit_blocked.description')}</InlineMessage>
            )}
            {children}
        </div>
    );
}
