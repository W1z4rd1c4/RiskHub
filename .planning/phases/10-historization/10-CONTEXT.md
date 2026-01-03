# Phase 10: Historization - Context

**Gathered:** 2025-12-30
**Status:** Ready for planning

<vision>
## How This Should Work

Risk owners and their delegates maintain KRIs on a clear cadence. The current, most up-to-date KRI value should be visible directly on the Risk detail page so managers can see status at a glance. The full KRI history lives on the KRI page; clicking a KRI takes you to a dedicated KRI detail view where past values are listed.

Each KRI has a reporting frequency (default quarterly, but adjustable). After a reporting period ends, there is a 15-day window to submit the value. When someone commits a value, it becomes the current value and is recorded into the historical log.

The responsible person for KRI updates is explicitly assigned; if none is set, ownership falls back to the linked Risk owner. People get reminders before the reporting period ends, a notification on the deadline date, and then follow-up reminders **weekly** if still not updated. 

There must be a dedicated **KRI Management / Reporting Status** view to track the progress of updates across the organization—seeing what's due, what's pending, and managing the entire reporting workflow. Overdue KRIs should also be visible on the main dashboard for quick attention.
</vision>

<essential>
## What Must Be Nailed

- **Clear cadence + accountability**: Each KRI has a frequency, an owner (or fallback to risk owner), and a strict 15-day submission window after period end.
- **History integrity**: Every committed value is stored in history and becomes the current value.
- **Reminders + visibility**: Advance reminder, deadline reminder, and **weekly overdue reminders** via notifications; overdue KRIs surface on the dashboard.
- **Reporting Workflow Management**: A central view to track the status of all KRI updates (Progress, Pending, Overdue).
- **Automated Breach Detection**: Immediate notifications to both the **KRI Owner** and the **Risk Owner** if a recorded value exceeds limits.
- **Locking behavior**: Once a new reporting period starts, non-privileged users cannot edit or submit values for past periods.
</essential>

<boundaries>
## What's Out of Scope

- Historical charts and visualizations (Phase 11).
- Risk/control change history (Phase 10 is KRI value history only).
- Extra metadata on submissions (comments, attachments, sources) for now.
</boundaries>

<specifics>
## Specific Ideas

- Current value shown on the Risk detail page.
- Full value history shown on the KRI page and dedicated KRI detail view.
- Overdue KRIs flagged on the dashboard tab.
- Editing a wrong entry requires Risk Manager approval.
- Privileged accounts can backdate or edit past-period values; others cannot once the new period starts.
</specifics>

<notes>
## Additional Context

Notifications reach the assigned KRI responsible person; if none is set, notify the risk owner. Reminder cadence: advance notice before deadline, notification on deadline date, then **weekly** while overdue. Breach notifications must go to both KRI and Risk owners.
</notes>

---

*Phase: 10-historization*
*Context gathered: 2025-12-30*
