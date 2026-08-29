import type { ReactNode } from 'react';

interface EntityDetailHeaderProps {
    actions?: ReactNode;
    backAction: ReactNode;
    description?: ReactNode;
    identifier?: ReactNode;
    identifierSeparatorLabel: string;
    metadata?: ReactNode;
    statuses?: ReactNode;
    supplementary?: ReactNode;
    title: ReactNode;
    titleAdornment?: ReactNode;
}

export function EntityDetailHeader({
    actions,
    backAction,
    description,
    identifier,
    identifierSeparatorLabel,
    metadata,
    statuses,
    supplementary,
    title,
    titleAdornment,
}: EntityDetailHeaderProps) {
    const hasIdentifier = identifier !== null && identifier !== undefined && identifier !== '';

    return (
        <header className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
                <div className="mb-4 min-w-0 [&>*]:max-w-full [&>*]:break-words [&>*]:whitespace-normal [&>*]:[overflow-wrap:anywhere]">
                    {backAction}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                    {hasIdentifier ? (
                        <>
                            <span className="max-w-full break-all text-sm font-bold text-muted-foreground">
                                {identifier}
                            </span>
                            <span
                                role="separator"
                                aria-label={identifierSeparatorLabel}
                                className="text-muted-foreground"
                            >
                                ·
                            </span>
                        </>
                    ) : null}
                    <h1 className="min-w-0 max-w-full break-words text-4xl font-black tracking-tighter text-foreground [overflow-wrap:anywhere]">
                        {title}
                    </h1>
                    {titleAdornment}
                    {statuses ? (
                        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 [&>*]:max-w-full [&>*]:break-words [&>*]:whitespace-normal [&>*]:[overflow-wrap:anywhere]">
                            {statuses}
                        </div>
                    ) : null}
                </div>
                {metadata ? (
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 break-words text-sm font-medium text-muted-foreground [overflow-wrap:anywhere]">
                        {metadata}
                    </div>
                ) : null}
                {description ? (
                    <div className="max-w-3xl whitespace-pre-wrap break-words font-medium text-muted-foreground [overflow-wrap:anywhere]">
                        {description}
                    </div>
                ) : null}
                {supplementary ? (
                    <div className="flex min-w-0 max-w-full flex-wrap gap-2 pt-1 [&>*]:max-w-full [&>*]:break-words [&>*]:whitespace-normal [&>*]:[overflow-wrap:anywhere]">
                        {supplementary}
                    </div>
                ) : null}
            </div>
            {actions ? (
                <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3 [&>*]:max-w-full [&>*]:break-words [&>*]:whitespace-normal [&>*]:[overflow-wrap:anywhere]">
                    {actions}
                </div>
            ) : null}
        </header>
    );
}
