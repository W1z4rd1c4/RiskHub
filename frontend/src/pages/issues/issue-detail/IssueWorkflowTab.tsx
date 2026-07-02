import { RemediationPlanCard } from '@/components/issues/RemediationPlanCard';
import type { Issue } from '@/types/issue';

interface IssueWorkflowTabProps {
    issue: Issue;
}

export function IssueWorkflowTab({ issue }: IssueWorkflowTabProps) {
    return (
        <section data-testid="issue-workflow-panel">
            <RemediationPlanCard issue={issue} />
        </section>
    );
}
