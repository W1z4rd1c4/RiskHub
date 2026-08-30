import { FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';
import type { Issue, IssueContextEntityType } from '@/types/issue';

interface ContextualIssueActionProps {
    buttonLabel: string;
    canCreateIssue: boolean;
    contextEntityId: number;
    contextEntityLabel: string;
    contextEntityType: IssueContextEntityType;
    isOpen: boolean;
    onClose: () => void;
    onCreated: (issue: Issue) => void;
    onOpen: () => void;
}

export function ContextualIssueAction({
    buttonLabel,
    canCreateIssue,
    contextEntityId,
    contextEntityLabel,
    contextEntityType,
    isOpen,
    onClose,
    onCreated,
    onOpen,
}: ContextualIssueActionProps) {
    return (
        <>
            {canCreateIssue && (
                <Button
                    type="button"
                    variant="outline"
                    onClick={onOpen}
                    className="bg-white/5 text-foreground hover:border-accent/50"
                >
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    {buttonLabel}
                </Button>
            )}
            {isOpen && (
                <IssueQuickCreateModal
                    isOpen
                    onClose={onClose}
                    contextEntityType={contextEntityType}
                    contextEntityId={contextEntityId}
                    contextEntityLabel={contextEntityLabel}
                    onCreated={onCreated}
                />
            )}
        </>
    );
}
