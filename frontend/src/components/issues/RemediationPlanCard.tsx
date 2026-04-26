import type { Issue } from '@/types/issue';
import { resolveCapabilityFlag } from '@/lib/capabilities';

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

export function RemediationPlanCard({ issue, canWrite: _canWrite, canApprove: _canApprove }: RemediationPlanCardProps) {
    const canUseOwnerLookup = resolveCapabilityFlag(issue.capabilities, 'can_use_owner_lookup');
    const workflow = useRemediationPlanWorkflow({ canWrite: canUseOwnerLookup, issue });
    const canAssign = resolveCapabilityFlag(issue.capabilities, 'can_assign_owner');
    const canStartRemediation = resolveCapabilityFlag(issue.capabilities, 'can_start_remediation');
    const canUpdateProgress = resolveCapabilityFlag(issue.capabilities, 'can_update_remediation_progress');
    const canRequestException = resolveCapabilityFlag(issue.capabilities, 'can_request_exception');
    const canApproveException = resolveCapabilityFlag(issue.capabilities, 'can_approve_exception');
    const canClose = resolveCapabilityFlag(issue.capabilities, 'can_close');

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
                        canStartRemediation={workflow.canStartRemediation && canStartRemediation}
                        canWrite={canAssign}
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
                        canWrite={canUpdateProgress}
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
                        canApprove={canApproveException}
                        canWrite={canRequestException}
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
                        canWrite={canClose}
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
