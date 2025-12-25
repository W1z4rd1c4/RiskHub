---
description: "Review sub-agent work and merge"
---

# Review & Merge Workflow

Use this workflow to review sub-agent deliverables and integrate approved changes.

## Review Checklist
- [ ] Diff is scoped to the original task (no unrelated changes).
- [ ] Summary accurately describes the changes.
- [ ] Success criteria from the task brief are met.
- [ ] Tests pass (or documented as N/A — see below).
- [ ] Code follows project style guidelines.
- [ ] No new security or performance regressions.

## Handling "No Tests" Situations
If the task has no automated tests:
1. Document this in the review notes.
2. Require a manual smoke test or demo.
3. Add a TODO for future test coverage if appropriate.

## Steps

1. **Receive Artifacts:**
   - Diff/patch (format: `git diff` or `apply_patch` compatible).
   - Summary (max 5 bullets).
   - Test output or command.

2. **Apply Patch (Preview):**
   ```bash
   # Preview only
   git apply --check patch.diff
   ```

3. **Run Automated Checks:**
   ```bash
   # If tests exist
   npm test -- <suite>
   npm run lint
   ```

4. **Manual Review:**
   - Read the diff.
   - Verify against the task brief and success criteria.
   - Check for logic and architecture issues.

5. **Decision:**
   - **Approve:** Apply and commit:
     ```bash
     git apply patch.diff
     git add -A
     git commit -m "Task: [description]"
     ```
   - **Request Changes:** Use the feedback format below.

## Feedback Format (for Rejections)
```
Requested Changes:
1. [File:Line] [Description of issue]
2. ...

Next Steps:
- [Action for sub-agent]
- Re-run: [test command]
```

## Scope Escalation Process
If a sub-agent needs to modify files outside their defined scope:
1. Sub-agent reports the need with justification.
2. Main agent reviews and either:
   - Expands scope and instructs sub-agent to proceed.
   - Rejects and provides alternative guidance.

## Escalation
If the sub-agent is blocked or fails repeatedly:
- Main agent takes over the task directly.
- Document the blocker for future reference.
