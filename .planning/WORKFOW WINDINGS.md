Thought for 3s



I'll conduct a deep audit of the business logic. Let me systematically review the key areas:

Searched
can_resolve_approvals
26 results
Searched
check_department_access
44 results
Analyzed
permissions.py#L1-160
Analyzed
permissions.py#L161-280
Searched
has_sensitive_field_changes
5 results
Searched
is_priority
20 results
Searched
net_score
12 results
Searched
breach
102 results
Analyzed
approvals.py#L1-731
Now let me check a few more critical areas - the risk status transitions, control linkage logic, and score calculation:

Searched
RiskStatus
45 results
Analyzed
risk.py#L1-100
Searched
is_owner
6 results
Searched
is_scenario_enabled
8 results
Analyzed
risks.py#L360-400
Analyzed
risks.py#L580-620
I have now completed my deep audit of the business logic. Let me compile my findings:

🔍 DEEP AUDIT FINDINGS - Business Logic
✅ WORKING CORRECTLY
Area	Status	Notes
Department Access Control	✅	
check_department_access()
 correctly enforces department-based access. Privileged users (GLOBAL scope) bypass, others restricted to their department(s).
Permission Checking	✅	
has_permission()
 correctly walks role→permissions chain. Wildcards *:* work.
Privileged User Detection	✅	
can_resolve_approvals()
 = GLOBAL scope + approvals:write
Risk Score Calculation	✅	net_score = net_probability × net_impact calculated on create/update
Approval Tiered Flow	✅	PENDING → PENDING_PRIVILEGED → APPROVED works correctly
KRI Breach Detection	✅	current_value < lower_limit or > upper_limit correctly detected
⚠️ ISSUES FOUND
1. Scenario Toggle NOT Applied to DELETE Endpoints (Medium)
The 
is_scenario_enabled()
 check was added to edit workflows but DELETE endpoints do NOT check risk_delete, control_delete, kri_delete scenarios.

Impact: CRO cannot disable deletion approvals even if configured in Risk Hub.

Location:

risks.py:delete_risk() - line 590, always requires approval for non-privileged
controls.py:delete_control() - line 491, always requires approval
kris.py:delete_kri() - line 462, always requires approval
2. Sensitive Field Check Bypassed on is_priority=False→True Upgrade (Low)
In 
has_sensitive_field_changes()
 (line 238-243 in permissions.py):

python
if field == "is_priority":
    if old_val is True and new_val is False:
        changed[field] = {"old": old_val, "new": new_val}
    # false→true is allowed without approval
Design Decision: Upgrading a risk to priority does NOT require approval. This might be intentional (escalating risk is always allowed) but should be documented.

3. KRI Edit (PUT) Always Requires Approval (Low/Intentional?)
In kris.py:update_kri() (line 356), ALL edits by non-privileged users require approval with no scenario check. This is more restrictive than risks/controls.

Impact: No CRO toggle to disable KRI metadata edit approvals.

4. Cancel Approval Only Works for PENDING Status (Bug)
In approvals.py:cancel_request() (line 638):

python
if approval.status != ApprovalStatus.PENDING:
    raise HTTPException(...)
Users cannot cancel their own PENDING_PRIVILEGED request (e.g., after Risk Owner approved, before CRO approves).

5. Risk Owner Edit Permission Without Approval Check (By Design?)
In 
risks.py
 (line 375):

python
if not has_write and not is_owner:
    raise HTTPException(...)
Risk owners CAN edit their own risks without needing risks:write permission. However, unlike Controls, there's no mandatory approval for risk owner edits unless it's a priority risk. Controls have:

python
# Check 3: Owner edits always require approval
if not requires_approval and is_owner:
    requires_approval = True
Inconsistency: Control owners always need approval. Risk owners do not unless priority/sensitive field.

6. Archived Risk Cannot Be Reactivated (Intentional)
Line 389-394 in risks.py blocks changing status from archived to any other status. This is intentional but worth noting - archiving is PERMANENT unless via database/admin intervention.

