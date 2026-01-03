# The Ecosystem: How RiskHub Plays Well With Others

RiskHub does not live on an island. It is designed to be the central nervous system of your risk management ecosystem, and its ability to integrate is its greatest strength.

## The Directory Mirror (AD Sync)
The most critical integration is the **AD Sync**. We know that managing users in two places is a recipe for error. Our sync logic reaches out to your corporate directory and mirrors the truth. 
- **The Connector**: We’ve built a dedicated `ADEmulatorClient` that speaks the language of corporate APIs.
- **The Differential**: We don't just overwrite data; we perform a "Diff." We look for what has changed—a new department, a promoted manager, a departed employee—and apply only those changes.

## The Reporting Factory
Administrators need to share insights with stakeholders. Our **Reporting Service** is the printing press of RiskHub. 
- **PDF Generation**: We take the live state of your Risk Register and "draw" professional-grade PDF reports. It’s not just a print-screen; it’s a formatted document ready for a boardroom meeting.
- **Excel Exports**: For those who need to crunch numbers, we provide structured Excel exports that preserve the hierarchy and attributes of your risk data.

## The Security Handshake
Our integration with your identity system uses **JWT (JSON Web Tokens)**. It's like a high-security digital passport. Once you log in, you carry this token with you for the duration of your session. Every time you ask for a secret (like the audit logs), you show the backend this passport.

## The Database Heart
While RiskHub speaks "Python," it remembers in "SQL." Our **PostgreSQL** integration is refined and robust. Using **Alembic**, we can migrate the entire database schema from one version to another in seconds, ensuring your data is always shaped to fit the latest features.

---
*By focusing on strong, standard integrations, we ensure that RiskHub fits perfectly into your existing IT landscape today and tomorrow.*
