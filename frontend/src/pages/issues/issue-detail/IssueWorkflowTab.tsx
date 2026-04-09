import { RemediationPlanCard } from '@/components/issues/RemediationPlanCard';
import type { Issue } from '@/types/issue';

interface IssueWorkflowTabProps {
    canApprove: boolean;
    canWrite: boolean;
    issue: Issue;
}

export function IssueWorkflowTab({
    canApprove,
    canWrite,
    issue,
}: IssueWorkflowTabProps) {
    return (
        <section data-testid="issue-workflow-panel">
            <RemediationPlanCard
                issue={issue}
                canWrite={canWrite}
                canApprove={canApprove}
            />
        </section>
    );
}
