import { FileText } from 'lucide-react';

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
                <button
                    onClick={onOpen}
                    className="px-4 py-2.5 bg-white/5 border border-border rounded-xl text-foreground hover:border-accent/50 transition-colors flex items-center gap-2"
                >
                    <FileText className="h-4 w-4" />
                    {buttonLabel}
                </button>
            )}
            <IssueQuickCreateModal
                isOpen={isOpen}
                onClose={onClose}
                contextEntityType={contextEntityType}
                contextEntityId={contextEntityId}
                contextEntityLabel={contextEntityLabel}
                onCreated={onCreated}
            />
        </>
    );
}
