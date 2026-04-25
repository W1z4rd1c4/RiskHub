import type { Issue } from '@/types/issue';

import { AssignmentSection } from './remediation/AssignmentSection';
import { ClosedSection, ClosureSection } from './remediation/ClosureSection';
import { ExceptionSection } from './remediation/ExceptionSection';
import { ProgressSection } from './remediation/ProgressSection';
import { useRemediationPlanWorkflow } from './remediation/useRemediationPlanWorkflow';
import { WorkflowSummarySection } from './remediation/WorkflowSummarySection';

interface RemediationPlanCardProps {
    issue: Issue;
    canWrite: boolean;
    canApprove: boolean;
}

export function RemediationPlanCard({ issue, canWrite, canApprove }: RemediationPlanCardProps) {
    const workflow = useRemediationPlanWorkflow({ canWrite, issue });

    return (
        <div className="space-y-5" data-testid="issue-workflow-sections">
            <WorkflowSummarySection errorKey={workflow.errorKey} issue={issue} />
            {workflow.isClosed ? (
                <ClosedSection issue={issue} />
            ) : (
                <>
                    <AssignmentSection
                        assignDueAt={workflow.assignDueAt}
                        assignOwnerId={workflow.assignOwnerId}
                        canStartRemediation={workflow.canStartRemediation}
                        canWrite={canWrite}
                        isOwnersLoading={workflow.isOwnersLoading}
                        isSubmitting={workflow.isSubmitting}
                        onAssign={workflow.handleAssign}
                        onAssignDueAtChange={workflow.setAssignDueAt}
                        onAssignOwnerIdChange={workflow.setAssignOwnerId}
                        onStartRemediation={workflow.handleStartRemediation}
                        ownerOptions={workflow.ownerOptions}
                    />
                    <ProgressSection
                        blockerReason={workflow.blockerReason}
                        canWrite={canWrite}
                        completionNotes={workflow.completionNotes}
                        isInProgress={workflow.isInProgress}
                        isSubmitting={workflow.isSubmitting}
                        onBlockerReasonChange={workflow.setBlockerReason}
                        onCompletionNotesChange={workflow.setCompletionNotes}
                        onProgressPercentChange={workflow.setProgressPercent}
                        onRemediationStatusChange={workflow.setRemediationStatus}
                        onUpdateProgress={workflow.handleUpdateProgress}
                        progressPercent={workflow.progressPercent}
                        remediationStatus={workflow.remediationStatus}
                    />
                    <ExceptionSection
                        canApprove={canApprove}
                        canWrite={canWrite}
                        exceptionExpiresAt={workflow.exceptionExpiresAt}
                        exceptionReason={workflow.exceptionReason}
                        isInProgress={workflow.isInProgress}
                        isSubmitting={workflow.isSubmitting}
                        onApproveException={workflow.handleApproveException}
                        onExceptionExpiresAtChange={workflow.setExceptionExpiresAt}
                        onExceptionReasonChange={workflow.setExceptionReason}
                        onRequestException={workflow.handleRequestException}
                        requestedExceptionId={workflow.requestedExceptionId}
                    />
                    <ClosureSection
                        canWrite={canWrite}
                        isReadyForValidation={workflow.isReadyForValidation}
                        isSubmitting={workflow.isSubmitting}
                        onCloseIssue={workflow.handleClose}
                        onValidationNoteChange={workflow.setValidationNote}
                        validationNote={workflow.validationNote}
                    />
                </>
            )}
        </div>
    );
}
