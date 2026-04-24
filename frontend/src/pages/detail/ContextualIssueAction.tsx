import { FileText } from 'lucide-react';

import { PermissionGate } from '@/components/PermissionGate';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';
import type { Issue } from '@/types/issue';

interface ContextualIssueActionProps {
    buttonLabel: string;
    contextEntityId: number;
    contextEntityLabel: string;
    contextEntityType: 'control' | 'risk' | 'kri' | 'vendor';
    isOpen: boolean;
    onClose: () => void;
    onCreated: (issue: Issue) => void;
    onOpen: () => void;
}

export function ContextualIssueAction({
    buttonLabel,
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
            <PermissionGate resource="issues" action="write">
                <button
                    onClick={onOpen}
                    className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-300 hover:text-white hover:border-accent/50 transition-all flex items-center gap-2"
                >
                    <FileText className="h-4 w-4" />
                    {buttonLabel}
                </button>
            </PermissionGate>
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
