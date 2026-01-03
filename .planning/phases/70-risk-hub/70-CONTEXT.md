# Phase 70: Risk Hub & Platform Administration

## Vision
A strict separation of powers between **Business Administration** (CRO/Risk Hub) and **Platform Administration** (IT/System Admin).

- **Risk Hub (CRO)**: The "Command Center" for the business. Configures *how* risk management works (Risk Types, Approval Rules, Thresholds, Business Logic).
- **Admin Console (IT)**: The "Engine Room" for the platform. Manages *access and health* (Users, Sessions, Logs, System Health, Integrations).

## Business Logic (Risk Hub)
- **Dynamic Risk Types**: Configurable categories with Color/Description. Deletion is blocked if in use.
- **Approval Scenarios**: Simple toggles for fixed business events (e.g., "Require approval for High Risk deletion?").
- **Global Config**: Business variables (Thresholds, Notification settings) audit-logged separately from technical logs.

## Platform Logic (Admin Console)
- **User Management**: Add/Edit/Suspend users, Assign roles (including CRO).
- **System Health**: View API latency, DB status, Error rates (simulated or real).
- **Audit Logs**: Technical access logs (login/logout, failed attempts).
- **Integrations**: Configure SMTP, AD Connection strings (future).

## Boundaries
- **Admin** CANNOT see Risk Hub (403 Forbidden).
- **CRO** CANNOT see Admin Console (except maybe their own profile).
- **Admin** CANNOT create/edit/delete business data (Risks, Controls).

## Success Metrics
- CRO can reconfigure the risk matrix threshold without code changes.
- IT Admin can suspend a compromised user instantly.
- Business rules (approvals) can be tightened/loosened by CRO in seconds.
